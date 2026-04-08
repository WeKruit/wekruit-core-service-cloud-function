import OpenAI from 'openai';

export class MatchingEmbeddingService {
  private readonly client: OpenAI;

  constructor(apiKey: string, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey });
  }

  async createEmbedding(input: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input,
    });

    return response.data[0]?.embedding ?? [];
  }
}
