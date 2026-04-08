import { initializeFirebaseAdmin } from './bootstrap/firebase';
import { matchingApi } from './services/matching/functions/http/api';
import { outboundApi } from './services/outbound/functions/http/api';
import { outboundRetellWebhook } from './services/outbound/functions/http/retellWebhook';
import { outboundSendReminder } from './services/outbound/functions/tasks/sendReminder';
import { outboundStartCall } from './services/outbound/functions/tasks/startCall';

initializeFirebaseAdmin();

const firebaseExports = {
  outbound: {
    api: outboundApi,
    retell: {
      webhook: outboundRetellWebhook,
    },
    send: {
      reminder: outboundSendReminder,
    },
    start: {
      call: outboundStartCall,
    },
  },
  matching: {
    api: matchingApi,
  },
};

export = firebaseExports;
