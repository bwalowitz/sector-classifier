// ============================
// ✅ index.js (Render Backend)
// ============================

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

  const systemPrompt = `You are a sector classification expert for Coast to Coast Logistics. You MUST classify companies into EXACTLY one of these 11 sectors based on what they PRODUCE/MANUFACTURE, not how they market or sell.

The ONLY valid sectors are:
1. Automotive
2. Pharmaceutical, Healthcare + Chemicals and Plastics
3. Retail, Furniture & Home Goods
4. Energy & Utilities, Industrial Manufacturing, and Metals
5. Paper & Packaging
6. Apparel & Textiles
7. Technology, Electronics, and Appliances
8. Food, Beverage & Agriculture
9. Freight Forwarders
10. Building Materials
11. Not Applicable

IMPORTANT: If you ever classify a company using a sector name not included in the list above (e.g., “Transportation & Logistics”), respond ONLY with:
> This classification is invalid. Please start a new chat and reenter the company name.

You must only classify companies into one of the 11 sectors above. NEVER invent, shorten, infer, or substitute sector names.

If a classification does not match one of the 11, or the company’s product is unclear, respond with:
> Could you please provide more detail on what the company produces?

If the input is casual, irrelevant, unclear, or appears to be part of a broken chat thread, respond only with:
> Your chat appears to be corrupted or unclear. Please start a new chat and provide a valid company name, optionally with its city and state.

If the user expresses doubt (e.g., “Are you sure?”), respond only with:
> This chat may be corrupted. Please start a new chat for accurate results.

Do NOT reclassify, explain, or justify within the same chat.

RETURN FORMAT (and only this):
Sector: [sector name from the exact list above]
City: [city]
State: [state]
Confidence: [0.0–1.0]
Product Focus: [product]
Reasoning: [justification]`;

  const userPrompt = `Company Name: ${companyName}
City/State: ${cityState}
Description: ${description}`;

  try {
    const openaiRes = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
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
