import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';

import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import eventsRouter from './routes/events.js';
import fieldsRouter from './routes/fields.js';
import signaturesRouter from './routes/signatures.js';
import sharesRouter from './routes/shares.js';
import signingRouter from './routes/signing.js';
import exportRouter from './routes/export.js';
import inviteRouter from './routes/invite.js';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));

app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);  // GET|POST /documents, GET|DELETE /documents/:id ...
app.use('/api/events', eventsRouter);        // GET /events/:id
app.use('/api/documents', sharesRouter);     // GET|POST|DELETE /documents/:docId/shares ...
app.use('/api/documents', signingRouter);    // PATCH /documents/:docId/signing/status
app.use('/api/documents', exportRouter);     // POST /documents/:docId/export ...
app.use('/api', fieldsRouter);               // POST /documents/:docId/fields, PUT|DELETE /fields/:id
app.use('/api/signatures', signaturesRouter);// GET|POST /signatures, POST /documents/:docId/placements ...

app.use('/api/invite', inviteRouter);
app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
