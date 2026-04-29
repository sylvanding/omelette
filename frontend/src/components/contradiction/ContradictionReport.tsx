import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { contradictionsApi, type ContradictionResult } from '@/services/api';

interface ContradictionReportProps {
  projectId: number;
}

export function ContradictionReport({ projectId }: ContradictionReportProps) {
  const [result, setResult] = useState<ContradictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const data = await contradictionsApi.detect(projectId);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to detect contradictions');
    } finally {
      setLoading(false);
    }
  }

  const filteredContradictions = selectedTopic
    ? result?.contradictions.filter((c) => c.topic === selectedTopic)
    : result?.contradictions;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Contradiction Detection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Analyze all papers in this project to identify contradictory claims,
            findings, or positions across the literature.
          </p>
          <Button onClick={handleAnalyze} disabled={loading}>
            {loading ? 'Analyzing...' : 'Detect Contradictions'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {result && result.total_contradictions > 0 && (
        <>
          <ContradictionSummary result={result} />
          {result.topics.length > 1 && (
            <TopicFilter
              topics={result.topics}
              selectedTopic={selectedTopic}
              onSelect={setSelectedTopic}
            />
          )}
          <ContradictionTable contradictions={filteredContradictions ?? []} />
        </>
      )}

      {result && result.total_contradictions === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No contradictions detected among the papers in this project.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface ContradictionSummaryProps {
  result: ContradictionResult;
}

function ContradictionSummary({ result }: ContradictionSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <div className="flex-1 text-center">
            <div className="text-2xl font-bold text-red-500">{result.total_contradictions}</div>
            <div className="text-sm text-muted-foreground">Contradictions Found</div>
          </div>
          <div className="flex-1 text-center">
            <div className="text-2xl font-bold text-blue-500">{result.topics.length}</div>
            <div className="text-sm text-muted-foreground">Topics</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

interface TopicFilterProps {
  topics: string[];
  selectedTopic: string | null;
  onSelect: (topic: string | null) => void;
}

function TopicFilter({ topics, selectedTopic, onSelect }: TopicFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        variant={selectedTopic === null ? 'default' : 'secondary'}
        className="cursor-pointer"
        onClick={() => onSelect(null)}
      >
        All
      </Badge>
      {topics.map((topic) => (
        <Badge
          key={topic}
          variant={selectedTopic === topic ? 'default' : 'secondary'}
          className="cursor-pointer"
          onClick={() => onSelect(selectedTopic === topic ? null : topic)}
        >
          {topic}
        </Badge>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface ContradictionTableProps {
  contradictions: ContradictionResult['contradictions'];
}

function ContradictionTable({ contradictions }: ContradictionTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Contradiction Details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {contradictions.map((c, index) => (
            <ContradictionCard key={index} contradiction={c} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface ContradictionCardProps {
  contradiction: ContradictionResult['contradictions'][number];
}

function ContradictionCard({ contradiction }: ContradictionCardProps) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Badge variant="destructive">Contradiction</Badge>
        <span className="text-xs text-muted-foreground">
          Confidence: {(contradiction.confidence * 100).toFixed(0)}%
        </span>
      </div>

      <p className="text-sm font-medium">{contradiction.claim}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {contradiction.paper_a_title}
          </div>
          <p className="text-sm text-green-700 dark:text-green-400">
            {contradiction.position_a}
          </p>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {contradiction.paper_b_title}
          </div>
          <p className="text-sm text-red-700 dark:text-red-400">
            {contradiction.position_b}
          </p>
        </div>
      </div>

      <Badge variant="secondary" className="text-xs">
        {contradiction.topic}
      </Badge>
    </div>
  );
}
