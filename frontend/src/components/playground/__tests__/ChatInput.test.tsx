import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test/utils';
import ChatInput from '../ChatInput';

describe('ChatInput', () => {
  it('should render textarea and submit button', () => {
    const onSend = vi.fn();
    renderWithProviders(<ChatInput onSend={onSend} isLoading={false} />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should call onSend when Enter is pressed with text', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChatInput onSend={onSend} isLoading={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello{Enter}');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Hello');
  });

  it('should not call onSend when textarea is empty', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChatInput onSend={onSend} isLoading={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '{Enter}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should be disabled when isLoading is true', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChatInput onSend={onSend} isLoading={true} />);

    const textarea = screen.getByRole('textbox');
    const button = screen.getByRole('button');

    expect(textarea).toBeDisabled();
    expect(button).toBeDisabled();

    await user.type(textarea, 'Hello{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('should support Shift+Enter for newline without submitting', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChatInput onSend={onSend} isLoading={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Line 1{Shift>}{Enter}{/Shift}Line 2{Enter}');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Line 1\nLine 2');
  });
});
