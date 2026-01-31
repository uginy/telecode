import type React from 'react';
import { ArrowLeft, Search, Sparkles, FileText, Layers, Activity } from 'lucide-react';
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
    <div className="flex flex-col h-full text-foreground">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/70 bg-background/80 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8 rounded-full">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Assistant panel</span>
          <h2 className="text-base font-semibold">Context intelligence</h2>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6 max-w-[980px] mx-auto w-full">
          {!lastContextSnapshot ? (
            <Card className="border-border/70 bg-card/70">
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                No context snapshot yet. Send a message to capture context.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <Card className="border-border/70 bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-xs uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                      <Activity className="w-3 h-3" /> Snapshot
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Used</span>
                      <span>
                        {formatChars(lastContextSnapshot.totalChars)} / {formatChars(lastContextSnapshot.maxChars)} chars
                      </span>
                    </div>
                    <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden">
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

                <Card className="border-border/70 bg-card/70">
                  <CardHeader>
                    <CardTitle className="text-xs uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                      <Layers className="w-3 h-3" /> Context layers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs text-muted-foreground">
                    {lastContextSnapshot.sections.map((section) => (
                      <div key={section.title} className="flex items-center justify-between gap-2">
                        <span className="truncate">{section.title}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {section.items.length}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                {lastContextSnapshot.sections.map((section) => (
                  <Card key={section.title} className="border-border/70 bg-card/70">
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
                            <div className="rounded-lg border border-border/70 bg-muted/30 p-2 text-xs font-mono whitespace-pre-wrap">
                              {item.content}
                            </div>
                            {index < section.items.length - 1 && <Separator />}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
