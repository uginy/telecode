import type React from 'react';
import { ArrowLeft, Search, Sparkles, FileText } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const formatChars = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
};

export const ContextView: React.FC = () => {
  const { lastContextSnapshot, setView } = useChatStore();

  const handleBack = () => {
    setView('chat');
  };

  const usagePercent = lastContextSnapshot
    ? Math.min(100, (lastContextSnapshot.totalChars / lastContextSnapshot.maxChars) * 100)
    : 0;

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-sm font-semibold">Context Inspector</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {!lastContextSnapshot ? (
            <div className="text-center text-muted-foreground py-8 text-sm">
              No context snapshot yet. Send a message to capture context.
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Used</span>
                    <span>
                      {formatChars(lastContextSnapshot.totalChars)} / {formatChars(lastContextSnapshot.maxChars)} chars
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-orange-500' : 'bg-primary'
                      )}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {lastContextSnapshot.sections.reduce((sum, section) => sum + section.items.length, 0)} items
                    </Badge>
                    <Badge variant={lastContextSnapshot.usedSearch ? 'default' : 'outline'} className="flex items-center gap-1">
                      <Search className="w-3 h-3" />
                      Search {lastContextSnapshot.usedSearch ? 'used' : 'skipped'}
                    </Badge>
                    <Badge variant={lastContextSnapshot.usedSemantic ? 'default' : 'outline'} className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Semantic {lastContextSnapshot.usedSemantic ? 'used' : 'skipped'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {lastContextSnapshot.sections.map((section) => (
                <Card key={section.title}>
                  <CardHeader>
                    <CardTitle className="text-sm">{section.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {section.items.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No items collected.</div>
                    ) : (
                      section.items.map((item, index) => (
                        <div key={`${section.title}-${index}`} className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold truncate">{item.label}</span>
                            {item.truncated && (
                              <Badge variant="outline" className="text-[10px]">Truncated</Badge>
                            )}
                          </div>
                          <div className="rounded-lg border bg-muted/30 p-2 text-xs font-mono whitespace-pre-wrap">
                            {item.content}
                          </div>
                          {index < section.items.length - 1 && <Separator />}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
