import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { StarRating } from '../star-rating';

describe('StarRating', () => {
  it('renders 5 stars', () => {
    render(<StarRating value={0} readOnly />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
  });

  it('fills stars up to the current value', () => {
    render(<StarRating value={3} readOnly />);
    const filledStars = document.querySelectorAll('.fill-amber-400');
    expect(filledStars).toHaveLength(3);
  });

  it('calls onChange when a star is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StarRating value={0} onChange={onChange} />);
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[3]);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('does not call onChange in read-only mode', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StarRating value={2} onChange={onChange} readOnly />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
    await user.click(buttons[2]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('highlights stars on hover', async () => {
    const user = userEvent.setup();
    render(<StarRating value={1} />);
    const buttons = screen.getAllByRole('button');
    await user.hover(buttons[4]);
    const filledStars = document.querySelectorAll('.fill-amber-400');
    expect(filledStars).toHaveLength(5);
  });

  it('renders with custom size', () => {
    render(<StarRating value={2} readOnly size={24} />);
    const svg = document.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });
});
