import { useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { evidenceConsensusApi, type EvidenceConsensusResult, type EvidencePaperFinding } from '@/services/api';

const STANCE_COLORS: Record<string, string> = {
  support: '#22c55e',
  contradict: '#ef4444',
  mixed: '#f59e0b',
};

const STANCE_BADGE_VARIANT: Record<string, 'default' | 'destructive' | 'secondary'> = {
  support: 'default',
  contradict: 'destructive',
  mixed: 'secondary',
};

interface EvidenceConsensusProps {
  projectId: number;
}

export function EvidenceConsensus({ projectId }: EvidenceConsensusProps) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<EvidenceConsensusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await evidenceConsensusApi.analyze(projectId, question.trim());
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyze consensus');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Evidence Consensus</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Enter a research question to analyze evidence consensus..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
          />
          <Button onClick={handleAnalyze} disabled={loading || !question.trim()}>
            {loading ? 'Analyzing...' : 'Analyze Consensus'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {result && <ConsensusChart result={result} />}
      {result && result.papers.length > 0 && <PaperFindings papers={result.papers} />}
    </div>
  );
}

interface ConsensusChartProps {
  result: EvidenceConsensusResult;
}

function ConsensusChart({ result }: ConsensusChartProps) {
  const chartData = [
    { name: 'Support', value: result.support_percentage, count: result.support_count, fill: STANCE_COLORS.support },
    { name: 'Contradict', value: result.contradict_percentage, count: result.contradict_count, fill: STANCE_COLORS.contradict },
    { name: 'Mixed', value: result.mixed_percentage, count: result.mixed_count, fill: STANCE_COLORS.mixed },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Consensus Distribution</CardTitle>
        <p className="text-sm text-muted-foreground">
          {result.total_papers} papers analyzed &middot; Confidence: {(result.overall_confidence * 100).toFixed(0)}%
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4">
          {chartData.map((item) => (
            <div key={item.name} className="flex-1 text-center">
              <div className="text-2xl font-bold" style={{ color: item.fill }}>
                {item.count}
              </div>
              <div className="text-sm text-muted-foreground">{item.name} ({item.value.toFixed(1)}%)</div>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <XAxis dataKey="name" />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface PaperFindingsProps {
  papers: EvidencePaperFinding[];
}

function PaperFindings({ papers }: PaperFindingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Paper Findings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {papers.map((paper) => (
            <div key={paper.paper_id} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">{paper.paper_title}</h4>
                <Badge variant={STANCE_BADGE_VARIANT[paper.stance]}>
                  {paper.stance.charAt(0).toUpperCase() + paper.stance.slice(1)}
                </Badge>
              </div>
              <p className="text-sm">{paper.finding}</p>
              {paper.source_quote && (
                <blockquote className="text-xs text-muted-foreground border-l-2 border-muted pl-3 italic">
                  "{paper.source_quote}"
                </blockquote>
              )}
              <div className="text-xs text-muted-foreground">
                Confidence: {(paper.confidence * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
