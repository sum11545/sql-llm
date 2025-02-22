const express = require('express');
const fetch = require('node-fetch'); // Ensure you're using node-fetch v2 (CommonJS)
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

// Serve all static files from the "public" directory
app.use(express.static('public'));

// Configure the Postgres pool using environment variables, with SSL enabled.
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

// Endpoint to generate SQL using Groq API.
app.post('/generate_sql', async (req, res) => {
  const prompt = req.body.prompt;
  const apiKey = process.env.GROQ_API_KEY; // Set your Groq API key in your .env file

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{
          role: "user",
          content: prompt
        }]
      })
    });

    const data = await response.json();
    console.log('data', data);

    // Extract the generated SQL from the response.
    let sql = 'No SQL returned.';
    if (data.choices && data.choices.length > 0 &&
        data.choices[0].message && data.choices[0].message.content) {
      const content = data.choices[0].message.content;
      // Use a regex to extract text between triple backticks (optionally with "sql")
      const regex = /```(?:sql)?\s*([\s\S]*?)\s*```/i;
      const match = content.match(regex);
      if (match && match[1]) {
        sql = match[1].trim();
      } else {
        sql = content.trim();
      }
    }
    res.json({ sql });
  } catch (error) {
    console.error('Error generating SQL:', error);
    res.status(500).json({ error: 'Failed to generate SQL.' });
  }
});

// Endpoint to execute the SQL query on Postgres.
app.post('/execute_sql', async (req, res) => {
  let sql = req.body.query;
  console.log('Original SQL:', sql);
  
  // Sanitize the SQL: Remove any lines that start with "USE" (PostgreSQL does not support USE).
  sql = sql.split('\n')
           .filter(line => !line.trim().toUpperCase().startsWith("USE"))
           .join('\n');
  console.log('Sanitized SQL:', sql);
  
  try {
    const result = await pool.query(sql);
    res.json({ result: result.rows });
  } catch (error) {
    console.error('Error executing SQL:', error);
    res.status(500).json({ error: 'Failed to execute SQL.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
