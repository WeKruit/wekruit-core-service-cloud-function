import { initializeFirebaseAdmin } from './bootstrap/firebase';
import { sourcingApi } from './services/sourcing/functions/http/api';

initializeFirebaseAdmin();

const exportMode = process.env.CORE_SERVICE_EXPORT_MODE;
const firebaseExports: Record<string, unknown> = {};

if (exportMode !== 'sourcing') {
  const { outboundApi } = require('./services/outbound/functions/http/api') as typeof import('./services/outbound/functions/http/api');
  const { outboundRetellWebhook } = require('./services/outbound/functions/http/retellWebhook') as typeof import('./services/outbound/functions/http/retellWebhook');
  const { outboundSendReminder } = require('./services/outbound/functions/tasks/sendReminder') as typeof import('./services/outbound/functions/tasks/sendReminder');
  const { outboundStartCall } = require('./services/outbound/functions/tasks/startCall') as typeof import('./services/outbound/functions/tasks/startCall');

  firebaseExports.outbound = {
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
  };
}

if (exportMode !== 'outbound') {
  firebaseExports.sourcing = {
    api: sourcingApi,
  };
}

export = firebaseExports;
