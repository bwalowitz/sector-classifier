const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/classify', async (req, res) => {
  const { companyName } = req.body;
  if (!companyName) return res.status(400).json({ error: 'Missing company name' });

  try {
    const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(companyName)}&api_key=${process.env.SERPAPI_KEY}`;
    const serpResponse = await axios.get(serpUrl);
    const organicResults = serpResponse.data.organic_results || [];
    const description =
      organicResults.find(r => r.snippet)?.snippet ||
      organicResults[0]?.snippet ||
      'No description found.';

    const gistRes = await axios.get(process.env.GIST_URL);
    const rules = gistRes.data;
    const prompt = `${rules.system_prompt}

Company Description:
${description}

Classify this company based on what it produces. Return only:
Sector: [sector]
City: [city]
State: [state]
Confidence: [0.0-1.0]
Product Focus: [product]
Reasoning: [brief explanation]`;

    const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: rules.system_prompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const content = openaiRes.data.choices[0].message.content;
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
    console.error(err);
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