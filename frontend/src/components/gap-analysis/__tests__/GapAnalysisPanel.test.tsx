import { renderWithProviders } from '@/test/utils';
import GapAnalysisPanel from '../GapAnalysisPanel';

const mockGaps = [
  {
    topic: 'Long-term clinical outcomes',
    description: 'No papers evaluate long-term effectiveness.',
    evidence: 'Papers 1 and 3 focus on short-term metrics.',
    related_paper_ids: [1, 3],
    gap_score: 0.82,
  },
  {
    topic: 'Cross-modal validation',
    description: 'Methods validated only on single modalities.',
    evidence: 'Papers 1 and 2 each test on one modality.',
    related_paper_ids: [1, 2],
    gap_score: 0.71,
  },
];

const mockQuestions = [
  {
    question: 'How do methods perform in longitudinal studies?',
    addresses_gap: 'Long-term clinical outcomes',
    novelty_score: 0.85,
    feasibility_score: 0.6,
  },
  {
    question: 'Can a single model work across modalities?',
    addresses_gap: 'Cross-modal validation',
    novelty_score: 0.78,
    feasibility_score: 0.55,
  },
];

describe('GapAnalysisPanel', () => {
  it('renders empty state when no gaps or questions', () => {
    const { getByText } = renderWithProviders(
      <GapAnalysisPanel gaps={[]} researchQuestions={[]} totalGaps={0} totalQuestions={0} />,
    );
    expect(
      getByText('No gap analysis results. Add papers with abstracts to see research opportunities.'),
    ).toBeTruthy();
  });

  it('renders summary cards with correct labels', () => {
    const { getByText } = renderWithProviders(
      <GapAnalysisPanel
        gaps={mockGaps}
        researchQuestions={mockQuestions}
        totalGaps={2}
        totalQuestions={2}
      />,
    );
    expect(getByText('Research Gaps')).toBeTruthy();
    expect(getByText('Research Questions')).toBeTruthy();
  });

  it('renders gap cards with topics and scores', () => {
    const { getByText } = renderWithProviders(
      <GapAnalysisPanel
        gaps={mockGaps}
        researchQuestions={[]}
        totalGaps={2}
        totalQuestions={0}
      />,
    );
    expect(getByText('Long-term clinical outcomes')).toBeTruthy();
    expect(getByText('Cross-modal validation')).toBeTruthy();
    expect(getByText('Identified Research Gaps')).toBeTruthy();
  });

  it('renders research questions with novelty and feasibility scores', () => {
    const { getByText, getAllByText } = renderWithProviders(
      <GapAnalysisPanel
        gaps={[]}
        researchQuestions={mockQuestions}
        totalGaps={0}
        totalQuestions={2}
      />,
    );
    expect(getByText('How do methods perform in longitudinal studies?')).toBeTruthy();
    expect(getByText('Candidate Research Questions')).toBeTruthy();
    expect(getAllByText(/Novelty/).length).toBeGreaterThanOrEqual(1);
    expect(getAllByText(/Feasibility/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders both gaps and questions sections', () => {
    const { getByText } = renderWithProviders(
      <GapAnalysisPanel
        gaps={mockGaps}
        researchQuestions={mockQuestions}
        totalGaps={2}
        totalQuestions={2}
      />,
    );
    expect(getByText('Identified Research Gaps')).toBeTruthy();
    expect(getByText('Candidate Research Questions')).toBeTruthy();
  });
});
