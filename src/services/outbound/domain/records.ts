export interface OutboundCandidateRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutboundBookingRecord {
  id: string;
  candidateId: string;
  candidateFullName: string;
  candidateEmail: string;
  candidatePhone: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: 'scheduled' | 'cancelled' | 'completed' | 'failed';
  dispatchProfileSlug: string;
  dispatchProfileName: string;
  routeSchool: string | null;
  routeCampaign: string | null;
  routePurpose: string | null;
  routeTags: string[];
  publicTitle: string | null;
  publicSubtitle: string | null;
  publicCity: string | null;
  publicMeetingType: string | null;
  publicAudience: string | null;
  publicSortOrder: number;
  retellAgentId: string;
  retellFromPhoneNumber: string;
  googleCalendarSubject: string;
  googleCalendarId: string;
  questionSetName: string | null;
  generalQuestions: string | null;
  calendarEventId: string | null;
  inviteSentAt: string | null;
  reminderSentAt: string | null;
  retellCallId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboundSchedulingInviteRecord {
  id: string;
  candidateId: string;
  candidateFullName: string;
  candidateEmail: string;
  candidatePhone: string;
  dispatchProfileSlug: string;
  dispatchProfileName: string;
  routeSchool: string | null;
  routeCampaign: string | null;
  routePurpose: string | null;
  routeTags: string[];
  publicTitle: string | null;
  publicSubtitle: string | null;
  publicCity: string | null;
  publicMeetingType: string | null;
  publicAudience: string | null;
  publicSortOrder: number;
  retellAgentId: string;
  retellFromPhoneNumber: string;
  googleCalendarSubject: string;
  googleCalendarId: string;
  questionSetName: string | null;
  generalQuestions: string | null;
  batchLabel: string | null;
  inviteToken: string;
  status: 'sent' | 'booked' | 'cancelled';
  bookingId: string | null;
  sentAt: string;
  bookedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboundCallArtifactRecord {
  id: string;
  bookingId: string;
  retellCallId: string;
  callStatus: string;
  recordingUrl: string | null;
  recordingMultiChannelUrl: string | null;
  transcript: string | null;
  callAnalysisJson: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboundBookingDetails {
  candidate: OutboundCandidateRecord;
  booking: OutboundBookingRecord;
}

export interface OutboundSchedulingInviteDetails {
  candidate: OutboundCandidateRecord;
  invite: OutboundSchedulingInviteRecord;
  booking: OutboundBookingRecord | null;
}

export interface OutboundAdminBookingDetails extends OutboundBookingDetails {
  artifact: {
    callStatus: string;
    recordingUrl: string | null;
    recordingMultiChannelUrl: string | null;
    transcript: string | null;
  } | null;
}

export interface OutboundAdminSchedulingInviteDetails {
  candidate: OutboundCandidateRecord;
  invite: OutboundSchedulingInviteRecord;
  booking: OutboundBookingRecord | null;
}
