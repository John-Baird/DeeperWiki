export interface LLMProvider {
  generateText(prompt: string, context?: string): Promise<string>;
  generateStructured<T = Record<string, any>>(
    prompt: string,
    schema?: string
  ): Promise<T>;
}

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string, model: string = "gpt-5-mini") {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = "https://api.openai.com/v1";
  }

  async generateText(prompt: string, context?: string): Promise<string> {
    const messages = context
      ? [
          { role: "system", content: context },
          { role: "user", content: prompt }
        ]
      : [{ role: "user", content: prompt }];

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content;
  }

  async generateStructured<T = Record<string, any>>(
    prompt: string,
    _schema?: string
  ): Promise<T> {
    const jsonPrompt = `${prompt}\n\nRespond with valid JSON only, no markdown code blocks.`;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: jsonPrompt }],
        temperature: 0.2,
        max_tokens: 3000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    try {
      const content = data.choices[0].message.content.trim();
      const jsonContent = content.startsWith("```")
        ? content
            .split("```")
            .filter((s) => s && !s.startsWith("json"))
            .join("")
            .trim()
        : content;
      return JSON.parse(jsonContent) as T;
    } catch (error) {
      throw new Error(`Failed to parse LLM response as JSON: ${error}`);
    }
  }
}

export function getLLMProvider(apiKey?: string, model?: string): LLMProvider | null {
  if (!apiKey) {
    return null;
  }
  return new OpenAIProvider(apiKey, model);
}
