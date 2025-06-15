const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/classify', async (req, res) => {
  const { companyName, description = '', cityState = '' } = req.body;
  if (!companyName) return res.status(400).json({ error: 'Missing company name' });

  try {
    // Step 1: Get description using SerpAPI
    const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(companyName)}&api_key=${process.env.SERPAPI_KEY}`;
    const serpResponse = await axios.get(serpUrl);
    const organicResults = serpResponse.data.organic_results || [];
    const fetchedDescription =
      organicResults.find(r => r.snippet)?.snippet ||
      organicResults[0]?.snippet ||
      'No description found.';

    const finalDescription = description || fetchedDescription;

    console.log('🔍 SerpAPI Description:', finalDescription);

    // Step 2: Load classification rules from Gist
    const gistRes = await axios.get(process.env.GIST_URL);
    const rulesText = gistRes.data;

    // System prompt = strict instructions + rules file
    const SYSTEM_PROMPT = `
IMPORTANT: If you ever classify a company using a sector name not included in the uploaded list (e.g., “Transportation & Logistics”), STOP and reply with:
> This classification is invalid. Please start a new chat and reenter the company name.

You must match exactly one of the 11 approved sectors in the uploaded file. Any deviation is a failure.

Only respond to valid company classification requests.  
If the input is casual, irrelevant, unclear, or appears to be part of a broken chat thread, respond only with:

> Your chat appears to be corrupted or unclear. Please start a new chat and provide a valid company name, optionally with its city and state.

If the user expresses doubt (e.g., “Are you sure?”, “You classified this differently before...”), respond only with:

> This chat may be corrupted. Please start a new chat for accurate results.

Do not attempt to reclassify, explain, or justify within the same chat.

${rulesText}`.trim();

    // User message
    const userPrompt = `Company: ${companyName}${finalDescription ? `\nDescription: ${finalDescription}` : ''}${cityState ? `\nLocation: ${cityState}` : ''}`;

    console.log('🧠 SYSTEM PROMPT:', SYSTEM_PROMPT);
    console.log('👤 USER PROMPT:', userPrompt);

    // Step 3: Send to OpenAI
    const openaiRes = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('🧠 Full OpenAI response:', JSON.stringify(openaiRes.data, null, 2));

    if (!openaiRes.data.choices || !openaiRes.data.choices[0] || !openaiRes.data.choices[0].message) {
      throw new Error("⚠️ OpenAI API returned no usable choices. Raw output logged above.");
    }

    const content = openaiRes.data.choices[0].message.content;

    console.log('📦 OpenAI Raw Output:', content);

    const result = {
      company_name: companyName,
      city: extract(content, 'City'),
      state: extract(content, 'State'),
      sector: extract(content, 'Sector'),
      confidence: parseFloat(extract(content, 'Confidence') || '0.8'),
      product_focus: extract(content, 'Product Focus'),
      reasoning: extract(content, 'Reasoning'),
    };

    result.formatted_output = `${companyName} based out of ${result.city}, ${result.state} falls into the ${result.sector} sector.`;
    res.json(result);
  } catch (err) {
    console.error('❌ Error during classification:', err);
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

function extract(text, label) {
  const line = text.split('\n').find(l => l.startsWith(`${label}:`));
  return line ? line.replace(`${label}:`, '').trim() : '';
}

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
