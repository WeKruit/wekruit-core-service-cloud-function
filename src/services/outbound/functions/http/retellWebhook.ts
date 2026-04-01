import { onRequest } from 'firebase-functions/v2/https';

import { outboundSecrets } from '../../../../bootstrap/secrets';
import { jsonError, verifyRetellWebhookSignature } from '../../application/http';
import { getOutboundRuntimeConfig } from '../../application/runtime';
import { OutboundBookingRepository } from '../../repositories/bookingRepository';

const bookingRepository = new OutboundBookingRepository();

export const outboundRetellWebhook = onRequest(
  {
    region: 'us-central1',
    invoker: 'public',
    secrets: outboundSecrets,
  },
  async (req, res) => {
    try {
      const config = getOutboundRuntimeConfig();
      const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
      const signature = req.header('x-retell-signature') ?? req.header('x-retell-signature-v2') ?? '';

      if (
        !signature ||
        !(await verifyRetellWebhookSignature(rawBody, config.retellApiKey, signature))
      ) {
        res.status(401).json({ ok: false });
        return;
      }

      const payload = JSON.parse(rawBody) as Record<string, unknown>;
      const eventType =
        (payload.event as string | undefined) ??
        (payload.event_type as string | undefined) ??
        (payload.type as string | undefined) ??
        'unknown';

      const call =
        (payload.call as Record<string, unknown> | undefined) ??
        (payload.data as Record<string, unknown> | undefined) ??
        payload;
      const retellCallId = String(call.call_id ?? '');

      if (!retellCallId) {
        res.status(202).json({ ok: true, ignored: true });
        return;
      }

      const booking = await bookingRepository.findByRetellCallId(retellCallId);
      if (!booking) {
        res.status(202).json({ ok: true, ignored: true });
        return;
      }

      await bookingRepository.saveCallArtifact({
        bookingId: booking.booking.id,
        retellCallId,
        callStatus: String(call.call_status ?? eventType),
        recordingUrl: call.recording_url ? String(call.recording_url) : null,
        recordingMultiChannelUrl: call.recording_multi_channel_url
          ? String(call.recording_multi_channel_url)
          : null,
        transcript: call.transcript ? String(call.transcript) : null,
        callAnalysisJson: call.call_analysis ? JSON.stringify(call.call_analysis) : null,
        startedAt: call.start_timestamp ? new Date(Number(call.start_timestamp)).toISOString() : null,
        endedAt: call.end_timestamp ? new Date(Number(call.end_timestamp)).toISOString() : null,
      });

      if (eventType === 'call_ended' || eventType === 'call_analyzed' || call.call_status === 'ended') {
        await bookingRepository.updateBookingStatus(booking.booking.id, 'completed');
      }

      if (call.call_status === 'error') {
        await bookingRepository.updateBookingStatus(booking.booking.id, 'failed');
      }

      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      jsonError(res, 500, message);
    }
  },
);
