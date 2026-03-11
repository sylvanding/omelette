import type { Page } from '@playwright/test';

export async function mockChatStream(
  page: Page,
  messages: string[] = ['Hello', ' world'],
) {
  await page.route('/api/v1/chat/stream', async (route) => {
    const events = [
      'event: start\ndata: {}\n\n',
      ...messages.map(
        (m) => `event: text-delta\ndata: ${JSON.stringify({ textDelta: m })}\n\n`,
      ),
      'event: finish\ndata: {}\n\n',
      'data: [DONE]\n\n',
    ];
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
      body: events.join(''),
    });
  });
}
