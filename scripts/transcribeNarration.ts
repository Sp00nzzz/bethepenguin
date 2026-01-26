import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// To use real transcription, set OPENAI_API_KEY in a .env file.
// Otherwise, the script will generate dummy subtitles for demonstration.
const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

const INPUT_FILE = path.resolve('public/Narration.mp3');
const OUTPUT_FILE = path.resolve('public/Narration.subtitles.json');

async function transcribe() {
    console.log('Transcribing', INPUT_FILE, '...');

    if (!openai) {
        console.warn('Warning: OPENAI_API_KEY is not set. Generating dummy subtitles...');
        console.log('Generating dummy subtitles for demonstration based on Narration.txt...');

        // Fallback: Generate based on the text we have
        const dummySubtitles = [
            { start: 1.0, end: 4.5, text: "But one of them caught our eye, the one in the center." },
            { start: 4.5, end: 10.0, text: "He would neither go towards the feeding grounds at the edge of the ice," },
            { start: 10.0, end: 13.5, text: "nor return to the colony." },
            { start: 14.5, end: 18.0, text: "Shortly afterwards, we saw him heading straight towards the mountains," },
            { start: 18.0, end: 22.0, text: "some seventy kilometers away." },
            { start: 23.0, end: 28.0, text: "Dr. Ainley explained that even if he caught him and brought him back to the colony," },
            { start: 28.0, end: 32.0, text: "he would immediately head right back for the mountains." },
            { start: 33.0, end: 35.5, text: "But why?" },
            { start: 37.5, end: 42.0, text: "With five thousand kilometers ahead of him," },
            { start: 42.0, end: 46.0, text: "stand still and let him go on his way?" }
        ];

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dummySubtitles, null, 2));
        console.log('Dummy subtitles written to', OUTPUT_FILE);
        return;
    }

    try {
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(INPUT_FILE),
            model: 'whisper-1',
            response_format: 'verbose_json',
            timestamp_granularities: ['segment'],
        });

        const segments = (transcription as any).segments.map((seg: any) => ({
            start: seg.start,
            end: seg.end,
            text: seg.text.trim(),
        }));

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(segments, null, 2));
        console.log('Transcription saved to', OUTPUT_FILE);
    } catch (error) {
        console.error('Transcription failed:', error);
    }
}

transcribe();
