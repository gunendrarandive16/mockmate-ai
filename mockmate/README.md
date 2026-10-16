# 🎯 MockMate – Interview Preparation Platform

A lightweight, no-build web app for practicing interviews. Everything runs in your browser and your data stays in `localStorage`.

## Features
- **Question bank** – 32 questions across Behavioral, HR, JavaScript & Web, DSA, System Design and CS Fundamentals, each with difficulty, tips and a model answer outline.
- **Practice mode** – filter by category and difficulty, answer by typing or **voice dictation**, with a stopwatch.
- **Mock interview** – timed multi-question sessions with auto-submit and a summary report.
- **Instant feedback** – score out of 100 based on key-concept coverage, answer length and filler words, plus STAR checks for behavioral questions.
- **Saved questions** and **history** – bookmark tough questions and review past attempts.
- **Dashboard** – answers practiced, average score, day streak, 7-day activity chart and per-category averages.
- Light/dark theme, responsive layout.

## Run it
No install needed. Either open `index.html` directly, or serve the folder:

```bash
cd mockmate
python3 -m http.server 8000
# open http://localhost:8000
```

Voice dictation uses the Web Speech API (works best in Chrome/Edge and needs HTTPS or localhost).

## Structure
```
mockmate/
├── index.html
├── css/styles.css
└── js/
    ├── data.js   # categories, questions, filler-word list
    └── app.js    # views, feedback engine, storage
```

## Extending
- Add questions to `QUESTIONS` in `js/data.js` (`id`, `cat`, `diff`, `q`, `keywords`, `tip`, `model`).
- Add a category by extending `CATEGORIES`.
- Scoring lives in `analyze()` in `js/app.js`.

> The scoring is a keyword and structure heuristic, not an AI evaluation. Use it as a practice aid and compare against the model outlines.
