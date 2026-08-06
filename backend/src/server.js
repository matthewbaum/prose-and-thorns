import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import booksRouter from './routes/books.js';
import seedRouter from './routes/seed.js';
import './db/index.js'; // ensures schema is created on boot

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/books', booksRouter);
app.use('/api/seed', seedRouter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Prose & Thorns API listening on http://localhost:${PORT}`);
});
