export type MatchingFeedbackReaction = 'like' | 'dislike' | 'applied';

export interface MatchingFeedbackRecord {
  id: string;
  userId: string;
  jobId: string;
  reaction: MatchingFeedbackReaction;
  companyName: string | null;
  jobTitle: string | null;
  createdAt: string;
  updatedAt: string;
}
