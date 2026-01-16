import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Bot, 
  Send, 
  Loader2, 
  Sparkles,
  MessageCircle,
  Zap,
  HelpCircle,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CostItem, Project } from '@/types/project';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  itemUpdates?: ItemUpdate[];
}

interface ItemUpdate {
  itemId: string;
  description: string;
  status: string;
  recommendedPrice?: number;
}

interface AIChatPanelProps {
  project: Project;
  items: CostItem[];
  onItemsUpdate: (updates: { id: string; updates: Partial<CostItem> }[]) => void;
  className?: string;
}

const QUICK_PROMPTS = [
  { icon: Zap, label: "Analyze All", prompt: "Analyze all items that need clarification and give me a summary" },
  { icon: HelpCircle, label: "Why flagged?", prompt: "Explain why items are flagged for review or clarification" },
  { icon: TrendingUp, label: "Market rates", prompt: "What are the current market rates for the main cost categories?" },
  { icon: BarChart3, label: "Compare", prompt: "Compare this project's costs to typical projects of this type" },
];

export function AIChatPanel({ project, items, onItemsUpdate, className }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I'm your AI Cost Analyst. I'm here to help analyze cost items for **${project.name}**.\n\nI can:\n- Analyze items needing clarification\n- Explain pricing recommendations\n- Compare costs to market benchmarks\n- Answer questions about specific items\n\nHow can I help you today?`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItemContext, setSelectedItemContext] = useState<CostItem | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleSend = async (prompt?: string) => {
    const messageText = prompt || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Check if this is an analyze all request
      const isAnalyzeAll = messageText.toLowerCase().includes('analyze all') || 
                           messageText.toLowerCase().includes('analyze items');
      
      let response: string;
      let itemUpdates: ItemUpdate[] = [];

      if (isAnalyzeAll) {
        // Use the analyze-cost-items function
        // Include items that need clarification OR review OR haven't been analyzed yet
        const itemsNeedingAnalysis = items.filter(i => 
          i.status === 'clarification' || 
          i.status === 'review' ||
          !i.matchedBenchmarkId // Not yet matched to a benchmark
        );
        
        if (itemsNeedingAnalysis.length === 0) {
          response = "All items have already been analyzed. There are no items currently needing analysis.";
        } else {
          // Show progress message
          setMessages(prev => [...prev, {
            id: 'analyzing-progress',
            role: 'assistant',
            content: `Analyzing **${itemsNeedingAnalysis.length} items**... This may take a moment.`,
            timestamp: new Date(),
          }]);

          const { data, error } = await supabase.functions.invoke('analyze-cost-items', {
            body: {
              items: itemsNeedingAnalysis.map(item => ({
                id: item.id,
                originalDescription: item.originalDescription,
                quantity: item.quantity,
                unit: item.unit,
                originalUnitPrice: item.originalUnitPrice,
                trade: item.trade,
                sheetName: item.sheetName,
              })),
              project: {
                country: project.country,
                currency: project.currency,
                projectType: project.projectType,
                name: project.name,
              },
            },
          });

          if (error) throw error;

          if (data?.items) {
            itemUpdates = data.items.map((result: any) => ({
              itemId: result.id,
              description: result.interpretedScope,
              status: result.status,
              recommendedPrice: result.recommendedUnitPrice,
            }));

            // Apply updates - INCLUDING all benchmark matching fields
            const updates = data.items.map((result: any) => {
              const originalItem = items.find(i => i.id === result.id);
              return {
                id: result.id,
                updates: {
                  interpretedScope: result.interpretedScope,
                  recommendedUnitPrice: result.recommendedUnitPrice,
                  benchmarkMin: result.benchmarkMin,
                  benchmarkTypical: result.benchmarkTypical,
                  benchmarkMax: result.benchmarkMax,
                  status: result.status,
                  aiComment: result.aiComment,
                  clarificationQuestion: result.clarificationQuestion,
                  totalPrice: originalItem ? originalItem.quantity * (result.recommendedUnitPrice || 0) : undefined,
                  // CRITICAL: Include benchmark matching fields for consistency
                  matchedBenchmarkId: result.matchedBenchmarkId || null,
                  matchConfidence: result.matchConfidence || null,
                  matchReasoning: result.matchReasoning || null,
                  priceSource: result.priceSource || null,
                },
              };
            });

            onItemsUpdate(updates);

            // Remove progress message
            setMessages(prev => prev.filter(m => m.id !== 'analyzing-progress'));

            const okCount = data.items.filter((i: any) => i.status === 'ok').length;
            const reviewCount = data.items.filter((i: any) => i.status === 'review').length;
            const clarifyCount = data.items.filter((i: any) => i.status === 'clarification').length;

            response = `## Analysis Complete ✓\n\nI've analyzed **${itemsNeedingAnalysis.length} items**:\n\n`;
            response += `- ✅ **${okCount}** items are OK (within market range)\n`;
            response += `- ⚠️ **${reviewCount}** items need review (pricing deviations)\n`;
            response += `- ❓ **${clarifyCount}** items still need clarification\n\n`;
            
            if (reviewCount > 0) {
              response += `### Items to Review\n\n`;
              const reviewItems = data.items.filter((i: any) => i.status === 'review');
              reviewItems.forEach((item: any) => {
                const original = items.find(i => i.id === item.id);
                response += `- **${original?.originalDescription?.slice(0, 50)}...**: ${item.aiComment}\n`;
              });
            }
          } else {
            response = "Analysis completed but no results were returned. Please try again.";
          }
        }
      } else {
        // Use general chat - create a context-aware prompt
        const contextPrompt = buildContextPrompt(messageText, items, project, selectedItemContext);
        
        const { data, error } = await supabase.functions.invoke('ai-chat', {
          body: { 
            messages: [
              ...messages.filter(m => m.id !== 'welcome').map(m => ({
                role: m.role,
                content: m.content,
              })),
              { role: 'user', content: contextPrompt }
            ],
            project: {
              country: project.country,
              currency: project.currency,
              projectType: project.projectType,
              name: project.name,
            },
            itemsSummary: buildItemsSummary(items),
          },
        });

        if (error) {
          // Fallback to analyze function if chat function doesn't exist
          console.log('ai-chat function not available, using fallback');
          response = generateFallbackResponse(messageText, items, project);
        } else {
          response = data?.response || data?.message || "I couldn't generate a response. Please try again.";
        }
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        itemUpdates: itemUpdates.length > 0 ? itemUpdates : undefined,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI Chat error:', error);
      
      let errorMessage = "I encountered an error processing your request.";
      if (error instanceof Error) {
        if (error.message.includes('429')) {
          errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
        } else if (error.message.includes('402')) {
          errorMessage = "AI credits exhausted. Please add credits to continue.";
        }
      }

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-primary/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Cost Analyst</h3>
            <p className="text-xs text-muted-foreground">
              {items.filter(i => i.status === 'clarification').length} items need analysis
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          <Sparkles className="h-3 w-3 mr-1" />
          Powered by AI
        </Badge>
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-b flex gap-2 flex-wrap">
        {QUICK_PROMPTS.map((prompt, idx) => (
          <Button
            key={idx}
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => handleSend(prompt.prompt)}
            disabled={isLoading}
          >
            <prompt.icon className="h-3 w-3 mr-1" />
            {prompt.label}
          </Button>
        ))}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === 'user' ? "flex-row-reverse" : ""
              )}
            >
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                message.role === 'assistant' ? "bg-primary/10" : "bg-muted"
              )}>
                {message.role === 'assistant' ? (
                  <Bot className="h-4 w-4 text-primary" />
                ) : (
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className={cn(
                "flex-1 rounded-lg p-3 text-sm",
                message.role === 'assistant' 
                  ? "bg-muted/50" 
                  : "bg-primary text-primary-foreground"
              )}>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {message.content.split('\n').map((line, i) => {
                    if (line.startsWith('## ')) {
                      return <h4 key={i} className="font-semibold mt-2 mb-1">{line.replace('## ', '')}</h4>;
                    }
                    if (line.startsWith('### ')) {
                      return <h5 key={i} className="font-medium mt-2 mb-1 text-sm">{line.replace('### ', '')}</h5>;
                    }
                    if (line.startsWith('- ')) {
                      return <p key={i} className="ml-2 my-0.5">{line}</p>;
                    }
                    if (line.trim() === '') return null;
                    return <p key={i} className="my-1">{line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/<strong>(.*?)<\/strong>/g, (_, text) => text)}</p>;
                  })}
                </div>
                {message.itemUpdates && message.itemUpdates.length > 0 && (
                  <div className="mt-3 pt-3 border-t space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Updated Items:</p>
                    {message.itemUpdates.slice(0, 3).map((update) => (
                      <div key={update.itemId} className="flex items-center gap-2 text-xs">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[10px] px-1",
                            update.status === 'ok' && "bg-success/10 text-success border-success/30",
                            update.status === 'review' && "bg-warning/10 text-warning border-warning/30",
                          )}
                        >
                          {update.status}
                        </Badge>
                        <span className="truncate">{update.description?.slice(0, 40)}...</span>
                      </div>
                    ))}
                    {message.itemUpdates.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{message.itemUpdates.length - 3} more items
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Analyzing...</span>
              </div>
            </div>
          )}
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about cost items..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button 
            onClick={() => handleSend()} 
            disabled={!input.trim() || isLoading}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// Helper functions
function buildContextPrompt(question: string, items: CostItem[], project: Project, selectedItem: CostItem | null): string {
  let context = `Project: ${project.name} (${project.projectType}) in ${project.country}, currency: ${project.currency}\n\n`;
  context += `Total items: ${items.length}\n`;
  context += `Status breakdown: ${items.filter(i => i.status === 'ok').length} OK, ${items.filter(i => i.status === 'review').length} Review, ${items.filter(i => i.status === 'clarification').length} Clarification\n\n`;
  
  if (selectedItem) {
    context += `Selected item: ${selectedItem.originalDescription} (${selectedItem.quantity} ${selectedItem.unit})\n`;
  }
  
  context += `\nUser question: ${question}`;
  return context;
}

function buildItemsSummary(items: CostItem[]): string {
  const byStatus = {
    ok: items.filter(i => i.status === 'ok').length,
    review: items.filter(i => i.status === 'review').length,
    clarification: items.filter(i => i.status === 'clarification').length,
  };
  
  const byTrade = items.reduce((acc, item) => {
    const trade = item.trade || 'Unassigned';
    acc[trade] = (acc[trade] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return JSON.stringify({ byStatus, byTrade, totalItems: items.length });
}

function generateFallbackResponse(question: string, items: CostItem[], project: Project): string {
  const lowerQ = question.toLowerCase();
  
  if (lowerQ.includes('why') && (lowerQ.includes('flag') || lowerQ.includes('review'))) {
    const reviewItems = items.filter(i => i.status === 'review');
    if (reviewItems.length === 0) return "There are no items currently flagged for review.";
    
    let response = "## Items Flagged for Review\n\n";
    reviewItems.slice(0, 5).forEach(item => {
      response += `- **${item.originalDescription?.slice(0, 50)}...**: ${item.aiComment || 'Pricing deviation detected'}\n`;
    });
    return response;
  }
  
  if (lowerQ.includes('market') || lowerQ.includes('rate')) {
    return `Based on ${project.country} market data for ${project.projectType} projects:\n\nI've analyzed the cost items against local benchmarks. Items are categorized as OK (within 15% of market), Review (15-30% deviation), or Clarification (needs more info).\n\nUse "Analyze All" to run a full analysis on pending items.`;
  }
  
  if (lowerQ.includes('compare') || lowerQ.includes('similar')) {
    const totalValue = items.reduce((sum, i) => sum + (i.totalPrice || 0), 0);
    return `## Project Comparison\n\nThis ${project.projectType} project has ${items.length} cost items with a total value of ${project.currency} ${totalValue.toLocaleString()}.\n\nTo get detailed comparisons, I recommend running "Analyze All" to benchmark each item against market data.`;
  }
  
  return `I understand you're asking about "${question}". To provide the best analysis, please use the quick action buttons above, or ask specific questions about:\n\n- Why items are flagged\n- Market rates for specific categories\n- Comparisons to similar projects\n\nYou can also click "Analyze All" to run AI analysis on all pending items.`;
}
