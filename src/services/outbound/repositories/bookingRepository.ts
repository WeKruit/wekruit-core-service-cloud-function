import { randomUUID } from 'node:crypto';

import { getCoreFirestore } from '../../../bootstrap/firebase';
import { outboundCollections } from '../../../shared/firestore/collections';
import type {
  OutboundAdminBookingDetails,
  OutboundAdminSchedulingInviteDetails,
  OutboundBookingDetails,
  OutboundBookingRecord,
  OutboundCallArtifactRecord,
  OutboundCandidateRecord,
  OutboundSchedulingInviteDetails,
  OutboundSchedulingInviteRecord
} from '../domain/records';

function compareIsoAscending(left: string, right: string) {
  return left.localeCompare(right);
}

function snapshotCandidateFromBooking(booking: OutboundBookingRecord): OutboundCandidateRecord {
  return {
    id: booking.candidateId,
    fullName: booking.candidateFullName,
    email: booking.candidateEmail,
    phone: booking.candidatePhone,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

function snapshotCandidateFromInvite(invite: OutboundSchedulingInviteRecord): OutboundCandidateRecord {
  return {
    id: invite.candidateId,
    fullName: invite.candidateFullName,
    email: invite.candidateEmail,
    phone: invite.candidatePhone,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
  };
}

export class OutboundBookingRepository {
  private readonly db = getCoreFirestore();
  private readonly candidateCollection = this.db.collection(outboundCollections.candidates);
  private readonly bookingCollection = this.db.collection(outboundCollections.bookings);
  private readonly inviteCollection = this.db.collection(outboundCollections.schedulingInvites);
  private readonly artifactCollection = this.db.collection(outboundCollections.callArtifacts);

  private async getCandidateById(id: string): Promise<OutboundCandidateRecord | null> {
    const snapshot = await this.candidateCollection.doc(id).get();
    return snapshot.exists ? (snapshot.data() as OutboundCandidateRecord) : null;
  }

  private async getBookingById(id: string): Promise<OutboundBookingRecord | null> {
    const snapshot = await this.bookingCollection.doc(id).get();
    return snapshot.exists ? (snapshot.data() as OutboundBookingRecord) : null;
  }

  private async getInviteById(id: string): Promise<OutboundSchedulingInviteRecord | null> {
    const snapshot = await this.inviteCollection.doc(id).get();
    return snapshot.exists ? (snapshot.data() as OutboundSchedulingInviteRecord) : null;
  }

  async upsertCandidate(input: {
    fullName: string;
    email: string;
    phone: string;
    now?: string;
  }): Promise<OutboundCandidateRecord> {
    const now = input.now ?? new Date().toISOString();

    const [emailSnapshot, phoneSnapshot] = await Promise.all([
      this.candidateCollection.where('email', '==', input.email).limit(1).get(),
      this.candidateCollection.where('phone', '==', input.phone).limit(1).get()
    ]);

    const emailMatch = emailSnapshot.empty ? null : (emailSnapshot.docs[0].data() as OutboundCandidateRecord);
    const phoneMatch = phoneSnapshot.empty ? null : (phoneSnapshot.docs[0].data() as OutboundCandidateRecord);

    if (emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id) {
      throw new Error(
        `Candidate email "${input.email}" and phone "${input.phone}" point to different records.`,
      );
    }

    const existing = emailMatch ?? phoneMatch;
    if (existing) {
      const candidate: OutboundCandidateRecord = {
        ...existing,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        updatedAt: now
      };
      await this.candidateCollection.doc(candidate.id).set(candidate);
      return candidate;
    }

    const candidate: OutboundCandidateRecord = {
      id: randomUUID(),
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      createdAt: now,
      updatedAt: now
    };
    await this.candidateCollection.doc(candidate.id).set(candidate);
    return candidate;
  }

  async createBooking(input: {
    candidateId: string;
    candidateFullName: string;
    candidateEmail: string;
    candidatePhone: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    dispatchProfileSlug: string;
    dispatchProfileName: string;
    routeSchool?: string | null;
    routeCampaign?: string | null;
    routePurpose?: string | null;
    routeTags?: string[];
    publicTitle?: string | null;
    publicSubtitle?: string | null;
    publicCity?: string | null;
    publicMeetingType?: string | null;
    publicAudience?: string | null;
    publicSortOrder?: number;
    retellAgentId: string;
    retellFromPhoneNumber: string;
    googleCalendarSubject: string;
    googleCalendarId: string;
    questionSetName?: string | null;
    generalQuestions?: string | null;
    calendarEventId?: string | null;
    now?: string;
  }): Promise<OutboundBookingRecord> {
    const bookingId = randomUUID();
    const now = input.now ?? new Date().toISOString();

    const booking: OutboundBookingRecord = {
      id: bookingId,
      candidateId: input.candidateId,
      candidateFullName: input.candidateFullName,
      candidateEmail: input.candidateEmail,
      candidatePhone: input.candidatePhone,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,
      status: 'scheduled',
      dispatchProfileSlug: input.dispatchProfileSlug,
      dispatchProfileName: input.dispatchProfileName,
      routeSchool: input.routeSchool ?? null,
      routeCampaign: input.routeCampaign ?? null,
      routePurpose: input.routePurpose ?? null,
      routeTags: input.routeTags ?? [],
      publicTitle: input.publicTitle ?? null,
      publicSubtitle: input.publicSubtitle ?? null,
      publicCity: input.publicCity ?? null,
      publicMeetingType: input.publicMeetingType ?? null,
      publicAudience: input.publicAudience ?? null,
      publicSortOrder: input.publicSortOrder ?? 0,
      retellAgentId: input.retellAgentId,
      retellFromPhoneNumber: input.retellFromPhoneNumber,
      googleCalendarSubject: input.googleCalendarSubject,
      googleCalendarId: input.googleCalendarId,
      questionSetName: input.questionSetName ?? null,
      generalQuestions: input.generalQuestions ?? null,
      calendarEventId: input.calendarEventId ?? null,
      inviteSentAt: null,
      reminderSentAt: null,
      retellCallId: null,
      createdAt: now,
      updatedAt: now
    };

    await this.bookingCollection.doc(booking.id).set(booking);
    return booking;
  }

  async createOrRefreshSchedulingInvite(input: {
    candidateId: string;
    candidateFullName: string;
    candidateEmail: string;
    candidatePhone: string;
    dispatchProfileSlug: string;
    dispatchProfileName: string;
    routeSchool?: string | null;
    routeCampaign?: string | null;
    routePurpose?: string | null;
    routeTags?: string[];
    publicTitle?: string | null;
    publicSubtitle?: string | null;
    publicCity?: string | null;
    publicMeetingType?: string | null;
    publicAudience?: string | null;
    publicSortOrder?: number;
    retellAgentId?: string;
    retellFromPhoneNumber?: string;
    googleCalendarSubject?: string;
    googleCalendarId?: string;
    questionSetName?: string | null;
    generalQuestions?: string | null;
    batchLabel?: string | null;
    now?: string;
  }): Promise<OutboundSchedulingInviteRecord> {
    const now = input.now ?? new Date().toISOString();

    const existingSnapshot = await this.inviteCollection
      .where('candidateId', '==', input.candidateId)
      .where('dispatchProfileSlug', '==', input.dispatchProfileSlug)
      .where('status', '==', 'sent')
      .limit(10)
      .get();

    const existing = existingSnapshot.docs
      .map((doc) => doc.data() as OutboundSchedulingInviteRecord)
      .filter((invite) => invite.bookingId === null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    if (existing) {
      const invite: OutboundSchedulingInviteRecord = {
        ...existing,
        candidateFullName: input.candidateFullName,
        candidateEmail: input.candidateEmail,
        candidatePhone: input.candidatePhone,
        dispatchProfileName: input.dispatchProfileName,
        routeSchool: input.routeSchool ?? null,
        routeCampaign: input.routeCampaign ?? null,
        routePurpose: input.routePurpose ?? null,
        routeTags: input.routeTags ?? [],
        publicTitle: input.publicTitle ?? null,
        publicSubtitle: input.publicSubtitle ?? null,
        publicCity: input.publicCity ?? null,
        publicMeetingType: input.publicMeetingType ?? null,
        publicAudience: input.publicAudience ?? null,
        publicSortOrder: input.publicSortOrder ?? 0,
        retellAgentId: input.retellAgentId ?? '',
        retellFromPhoneNumber: input.retellFromPhoneNumber ?? '',
        googleCalendarSubject: input.googleCalendarSubject ?? '',
        googleCalendarId: input.googleCalendarId ?? '',
        questionSetName: input.questionSetName ?? null,
        generalQuestions: input.generalQuestions ?? null,
        batchLabel: input.batchLabel ?? null,
        sentAt: now,
        updatedAt: now
      };
      await this.inviteCollection.doc(invite.id).set(invite);
      return invite;
    }

    const invite: OutboundSchedulingInviteRecord = {
      id: randomUUID(),
      candidateId: input.candidateId,
      candidateFullName: input.candidateFullName,
      candidateEmail: input.candidateEmail,
      candidatePhone: input.candidatePhone,
      dispatchProfileSlug: input.dispatchProfileSlug,
      dispatchProfileName: input.dispatchProfileName,
      routeSchool: input.routeSchool ?? null,
      routeCampaign: input.routeCampaign ?? null,
      routePurpose: input.routePurpose ?? null,
      routeTags: input.routeTags ?? [],
      publicTitle: input.publicTitle ?? null,
      publicSubtitle: input.publicSubtitle ?? null,
      publicCity: input.publicCity ?? null,
      publicMeetingType: input.publicMeetingType ?? null,
      publicAudience: input.publicAudience ?? null,
      publicSortOrder: input.publicSortOrder ?? 0,
      retellAgentId: input.retellAgentId ?? '',
      retellFromPhoneNumber: input.retellFromPhoneNumber ?? '',
      googleCalendarSubject: input.googleCalendarSubject ?? '',
      googleCalendarId: input.googleCalendarId ?? '',
      questionSetName: input.questionSetName ?? null,
      generalQuestions: input.generalQuestions ?? null,
      batchLabel: input.batchLabel ?? null,
      inviteToken: randomUUID(),
      status: 'sent',
      bookingId: null,
      sentAt: now,
      bookedAt: null,
      createdAt: now,
      updatedAt: now
    };

    await this.inviteCollection.doc(invite.id).set(invite);
    return invite;
  }

  async getBookingDetails(bookingId: string): Promise<OutboundBookingDetails | null> {
    const booking = await this.getBookingById(bookingId);
    if (!booking) {
      return null;
    }

    return {
      candidate: snapshotCandidateFromBooking(booking),
      booking,
    };
  }

  async getSchedulingInviteByToken(inviteToken: string): Promise<OutboundSchedulingInviteRecord | null> {
    const snapshot = await this.inviteCollection.where('inviteToken', '==', inviteToken).limit(1).get();
    return snapshot.empty ? null : (snapshot.docs[0].data() as OutboundSchedulingInviteRecord);
  }

  async getSchedulingInviteDetailsByToken(
    inviteToken: string,
  ): Promise<OutboundSchedulingInviteDetails | null> {
    const invite = await this.getSchedulingInviteByToken(inviteToken);
    if (!invite) {
      return null;
    }

    const [candidate, booking] = await Promise.all([
      this.getCandidateById(invite.candidateId),
      invite.bookingId ? this.getBookingById(invite.bookingId) : Promise.resolve(null)
    ]);

    return {
      candidate: candidate
        ? {
            ...candidate,
            fullName: invite.candidateFullName,
            email: invite.candidateEmail,
            phone: invite.candidatePhone,
          }
        : snapshotCandidateFromInvite(invite),
      invite,
      booking
    };
  }

  async listBookings(): Promise<OutboundBookingDetails[]> {
    const snapshot = await this.bookingCollection.get();
    const bookings = snapshot.docs
      .map((doc) => doc.data() as OutboundBookingRecord)
      .sort((left, right) => compareIsoAscending(left.startsAt, right.startsAt));

    return Promise.all(
      bookings.map(async (booking) => ({
        candidate: snapshotCandidateFromBooking(booking),
        booking
      })),
    );
  }

  async listAdminBookings(): Promise<OutboundAdminBookingDetails[]> {
    const bookings = await this.listBookings();
    const bookingIds = bookings.map((entry) => entry.booking.id);
    const artifactMap = await this.listArtifactsByBookingIds(bookingIds);

    return bookings.map((entry) => ({
      ...entry,
      artifact: artifactMap.get(entry.booking.id)
        ? {
            callStatus: artifactMap.get(entry.booking.id)!.callStatus,
            recordingUrl: artifactMap.get(entry.booking.id)!.recordingUrl,
            recordingMultiChannelUrl: artifactMap.get(entry.booking.id)!.recordingMultiChannelUrl,
            transcript: artifactMap.get(entry.booking.id)!.transcript
          }
        : null
    }));
  }

  async listSchedulingInvites(): Promise<OutboundSchedulingInviteRecord[]> {
    const snapshot = await this.inviteCollection.get();
    return snapshot.docs
      .map((doc) => doc.data() as OutboundSchedulingInviteRecord)
      .sort((left, right) => {
        const sentComparison = right.sentAt.localeCompare(left.sentAt);
        if (sentComparison !== 0) {
          return sentComparison;
        }
        return right.createdAt.localeCompare(left.createdAt);
      });
  }

  async listAdminSchedulingInvites(): Promise<OutboundAdminSchedulingInviteDetails[]> {
    const invites = await this.listSchedulingInvites();
    return Promise.all(
      invites.map(async (invite) => {
        const [candidate, booking] = await Promise.all([
          this.getCandidateById(invite.candidateId),
          invite.bookingId ? this.getBookingById(invite.bookingId) : Promise.resolve(null)
        ]);

        return {
          candidate: candidate
            ? {
                ...candidate,
                fullName: invite.candidateFullName,
                email: invite.candidateEmail,
                phone: invite.candidatePhone,
              }
            : snapshotCandidateFromInvite(invite),
          invite,
          booking
        };
      }),
    );
  }

  async findByRetellCallId(retellCallId: string): Promise<OutboundBookingDetails | null> {
    const snapshot = await this.bookingCollection.where('retellCallId', '==', retellCallId).limit(1).get();
    if (snapshot.empty) {
      return null;
    }
    const booking = snapshot.docs[0].data() as OutboundBookingRecord;
    return {
      candidate: snapshotCandidateFromBooking(booking),
      booking,
    };
  }

  async listReminderReadyBookings(
    reminderCutoffIso: string,
    nowIso: string,
  ): Promise<OutboundBookingDetails[]> {
    const bookings = await this.listBookings();
    return bookings.filter(
      (entry) =>
        entry.booking.status === 'scheduled' &&
        entry.booking.reminderSentAt === null &&
        entry.booking.startsAt <= reminderCutoffIso &&
        entry.booking.startsAt > nowIso,
    );
  }

  async listCallReadyBookings(nowIso: string): Promise<OutboundBookingDetails[]> {
    const bookings = await this.listBookings();
    return bookings.filter(
      (entry) =>
        entry.booking.status === 'scheduled' &&
        entry.booking.retellCallId === null &&
        entry.booking.startsAt <= nowIso,
    );
  }

  async markInviteSent(bookingId: string, sentAtIso: string): Promise<void> {
    const booking = await this.getBookingById(bookingId);
    if (!booking) {
      return;
    }
    await this.bookingCollection.doc(bookingId).set({
      ...booking,
      inviteSentAt: sentAtIso,
      updatedAt: sentAtIso
    });
  }

  async markReminderSent(bookingId: string, sentAtIso: string): Promise<void> {
    const booking = await this.getBookingById(bookingId);
    if (!booking) {
      return;
    }
    await this.bookingCollection.doc(bookingId).set({
      ...booking,
      reminderSentAt: sentAtIso,
      updatedAt: sentAtIso
    });
  }

  async attachBookingToSchedulingInvite(
    inviteId: string,
    bookingId: string,
    bookedAtIso: string,
  ): Promise<void> {
    const invite = await this.getInviteById(inviteId);
    if (!invite) {
      return;
    }
    await this.inviteCollection.doc(inviteId).set({
      ...invite,
      status: 'booked',
      bookingId,
      bookedAt: bookedAtIso,
      updatedAt: bookedAtIso
    });
  }

  async attachRetellCall(bookingId: string, retellCallId: string, updatedAtIso: string): Promise<void> {
    const booking = await this.getBookingById(bookingId);
    if (!booking) {
      return;
    }
    await this.bookingCollection.doc(bookingId).set({
      ...booking,
      retellCallId,
      updatedAt: updatedAtIso
    });
  }

  async updateBookingStatus(
    bookingId: string,
    status: OutboundBookingRecord['status'],
    updatedAtIso?: string,
  ): Promise<void> {
    const booking = await this.getBookingById(bookingId);
    if (!booking) {
      return;
    }
    const timestamp = updatedAtIso ?? new Date().toISOString();
    await this.bookingCollection.doc(bookingId).set({
      ...booking,
      status,
      updatedAt: timestamp
    });
  }

  async saveCallArtifact(input: {
    bookingId: string;
    retellCallId: string;
    callStatus: string;
    recordingUrl?: string | null;
    recordingMultiChannelUrl?: string | null;
    transcript?: string | null;
    callAnalysisJson?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    now?: string;
  }): Promise<OutboundCallArtifactRecord> {
    const now = input.now ?? new Date().toISOString();
    const existingSnapshot = await this.artifactCollection
      .where('retellCallId', '==', input.retellCallId)
      .limit(1)
      .get();

    const existing = existingSnapshot.empty
      ? null
      : (existingSnapshot.docs[0].data() as OutboundCallArtifactRecord);

    const artifact: OutboundCallArtifactRecord = {
      id: existing?.id ?? randomUUID(),
      bookingId: input.bookingId,
      retellCallId: input.retellCallId,
      callStatus: input.callStatus,
      recordingUrl: input.recordingUrl ?? null,
      recordingMultiChannelUrl: input.recordingMultiChannelUrl ?? null,
      transcript: input.transcript ?? null,
      callAnalysisJson: input.callAnalysisJson ?? null,
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    await this.artifactCollection.doc(artifact.id).set(artifact);
    return artifact;
  }

  private async listArtifactsByBookingIds(
    bookingIds: string[],
  ): Promise<Map<string, OutboundCallArtifactRecord>> {
    const map = new Map<string, OutboundCallArtifactRecord>();
    if (bookingIds.length === 0) {
      return map;
    }

    const chunks: string[][] = [];
    for (let index = 0; index < bookingIds.length; index += 10) {
      chunks.push(bookingIds.slice(index, index + 10));
    }

    for (const chunk of chunks) {
      const snapshot = await this.artifactCollection.where('bookingId', 'in', chunk).get();

      snapshot.docs.forEach((doc) => {
        const artifact = doc.data() as OutboundCallArtifactRecord;
        map.set(artifact.bookingId, artifact);
      });
    }

    return map;
  }
}
