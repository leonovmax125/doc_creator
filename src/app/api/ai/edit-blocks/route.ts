import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateBlocks, resolveGeminiKey, resolveGeminiModel } from '@/lib/gemini';
import { buildEditPrompt } from '@/lib/ai-prompts';
import { normalizeBlocks } from '@/lib/template-types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const body = (await request.json()) as { blocks?: unknown; instruction?: string };
  const blocks = normalizeBlocks(body.blocks);
  const instruction = (body.instruction ?? '').trim();

  if (blocks.length === 0 || !instruction) {
    return NextResponse.json({ error: 'Не хватает данных для правки' }, { status: 400 });
  }

  const apiKey = await resolveGeminiKey(supabase);
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Не задан ключ Gemini. Добавьте свой ключ в Настройках → Ключи ИИ.' },
      { status: 400 },
    );
  }

  try {
    const prompt = buildEditPrompt(blocks, instruction);
    const updated = await generateBlocks(await resolveGeminiModel(supabase), prompt, apiKey);
    return NextResponse.json({ blocks: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось обработать запрос';
    return NextResponse.json({ error: `ИИ не смог выполнить правку: ${message}` }, { status: 502 });
  }
}
