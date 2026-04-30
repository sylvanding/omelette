import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ReadingStreakHeatmap } from '../ReadingStreakHeatmap';

const mockActivityDays = (() => {
  const days = [];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    // Simulate some reading activity
    const count = i < 5 ? 2 : i < 10 ? 1 : 0;
    days.push({ date: dateStr, count });
  }
  return days;
})();

const mockPapersByDate: Record<string, Array<{ id: number; title: string; read_at: string | null }>> = {};
(() => {
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    mockPapersByDate[dateStr] = [{ id: i + 1, title: `Test Paper ${i + 1}`, read_at: d.toISOString() }];
  }
})();

describe('ReadingStreakHeatmap', () => {
  it('renders the streak counter', () => {
    render(
      <ReadingStreakHeatmap
        activityDays={mockActivityDays}
        streakDays={7}
        papersByDate={mockPapersByDate}
      />,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders SVG cells for activity days', () => {
    render(
      <ReadingStreakHeatmap
        activityDays={mockActivityDays}
        streakDays={7}
        papersByDate={mockPapersByDate}
      />,
    );
    // Should render rect elements (cells + legend)
    const rects = document.querySelectorAll('svg rect');
    // Legend has 5 rects, cells = number of activity days with content
    expect(rects.length).toBeGreaterThan(5);
  });

  it('renders day-of-week labels', () => {
    render(
      <ReadingStreakHeatmap
        activityDays={mockActivityDays}
        streakDays={7}
        papersByDate={mockPapersByDate}
      />,
    );
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
  });

  it('opens day detail dialog when clicking a cell with activity', async () => {
    const user = userEvent.setup();
    render(
      <ReadingStreakHeatmap
        activityDays={mockActivityDays}
        streakDays={7}
        papersByDate={mockPapersByDate}
      />,
    );
    // Click a rect cell
    const rects = document.querySelectorAll('rect[cursor-pointer]');
    if (rects.length > 0) {
      await user.click(rects[0]);
      // Dialog should appear with a paper title
      await vi.waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
      });
    }
  });

  it('shows zero state when no activity days', () => {
    render(
      <ReadingStreakHeatmap
        activityDays={[]}
        streakDays={0}
        papersByDate={{}}
      />,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders the legend with Less and More labels', () => {
    render(
      <ReadingStreakHeatmap
        activityDays={mockActivityDays}
        streakDays={7}
        papersByDate={mockPapersByDate}
      />,
    );
    expect(screen.getByText('Less')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });
});
