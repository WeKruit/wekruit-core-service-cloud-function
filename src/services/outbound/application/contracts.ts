import type { OutboundDispatchProfile } from '../domain/dispatch-profile';

export interface OutboundAvailableSlot {
  startIso: string;
  endIso: string;
  label: string;
}

export interface OutboundCalendarService {
  listAvailableSlots(profile: OutboundDispatchProfile): Promise<OutboundAvailableSlot[]>;
  findTestSlotAtOrAfter(
    profile: OutboundDispatchProfile,
    targetIso: string,
  ): Promise<OutboundAvailableSlot | null>;
  createInterviewEvent(input: {
    profile: OutboundDispatchProfile;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    questionSetName: string | null;
    generalQuestions: string | null;
  }): Promise<{ eventId: string | null }>;
}

export interface OutboundMailerService {
  sendSchedulingInvite(input: {
    inviteId: string;
    inviteUrl: string;
    dispatchProfileName: string;
    batchLabel: string | null;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    questionSetName: string | null;
    generalQuestions: string | null;
  }): Promise<void>;
  sendBookingConfirmation(input: {
    bookingId: string;
    bookingBaseUrl: string;
    dispatchProfileName: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    questionSetName: string | null;
    generalQuestions: string | null;
  }): Promise<void>;
  sendReminder(input: {
    bookingId: string;
    bookingBaseUrl: string;
    dispatchProfileName: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    questionSetName: string | null;
    generalQuestions: string | null;
  }): Promise<void>;
}

export interface OutboundRetellServiceContract {
  startInterviewCall(input: {
    bookingId: string;
    dispatchProfileSlug: string;
    dispatchProfileName: string;
    retellAgentId: string;
    retellFromPhoneNumber: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    startsAt: string;
    timezone: string;
    questionSetName: string | null;
    generalQuestions: string | null;
  }): Promise<{ callId: string; status: string }>;
  listVoiceAgents(): Promise<
    Array<{
      agentId: string;
      agentName: string | null;
      isPublished: boolean | null;
      version: number | null;
      webhookUrl: string | null;
      webhookEvents: string[] | null;
      webhookTimeoutMs: number | null;
    }>
  >;
  listPhoneNumbers(): Promise<
    Array<{
      phoneNumber: string;
      phoneNumberPretty: string | null;
      phoneNumberType: string | null;
    }>
  >;
}
