import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from '@/test/utils';
import MessageBubble from '../MessageBubble';

describe('MessageBubble', () => {
  it('renders user message as plain text', () => {
    renderWithProviders(
      <MessageBubble role="user" content="Hello world" />,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders assistant message with markdown', () => {
    renderWithProviders(
      <MessageBubble role="assistant" content="**bold text**" />,
    );
    const bold = screen.getByText('bold text');
    expect(bold.tagName).toBe('STRONG');
  });

  it('shows streaming indicator when isStreaming is true', () => {
    const { container } = renderWithProviders(
      <MessageBubble role="assistant" content="Thinking" isStreaming />,
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('does not show streaming indicator when isStreaming is false', () => {
    const { container } = renderWithProviders(
      <MessageBubble role="assistant" content="Done" isStreaming={false} />,
    );
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('renders citations when provided', () => {
    const citations = [
      {
        index: 1,
        paper_id: 10,
        paper_title: 'Test Paper',
        chunk_type: 'abstract',
        page_number: 5,
        relevance_score: 0.95,
        excerpt: 'relevant text',
      },
    ];
    renderWithProviders(
      <MessageBubble role="assistant" content="Answer" citations={citations} />,
    );
    expect(screen.getByText(/Test Paper/)).toBeInTheDocument();
    expect(screen.getByText(/p\.5/)).toBeInTheDocument();
  });

  it('does not render citations section when array is empty', () => {
    renderWithProviders(
      <MessageBubble role="assistant" content="Answer" citations={[]} />,
    );
    expect(screen.queryByText('playground.citations')).not.toBeInTheDocument();
  });
});
