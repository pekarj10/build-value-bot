import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  BookOpen, 
  MessageCircle, 
  Mail, 
  FileQuestion, 
  Upload, 
  BarChart3, 
  AlertTriangle,
  Search,
  ExternalLink
} from "lucide-react";
import { useState } from "react";

const faqs = [
  {
    question: "How do I create a new project?",
    answer: "Click the 'New Project' button on the dashboard or projects page. Fill in the project details including name, type, country, and currency. You can then upload your cost estimate files for analysis."
  },
  {
    question: "What file formats are supported?",
    answer: "Unit Rate supports Excel files (.xlsx, .xls) containing bill of quantities or cost estimates. The system uses AI to parse and analyze the cost items automatically."
  },
  {
    question: "How does the AI analysis work?",
    answer: "Our AI analyzes each cost item by comparing it against benchmark prices from our database. It identifies potential issues, suggests corrections, and provides recommendations for cost optimization."
  },
  {
    question: "What do the different status colors mean?",
    answer: "Green (OK) - Item has been verified and is within benchmark range. Yellow (Review) - Item needs attention due to pricing variance. Red (Clarification) - Significant pricing concern that requires review or additional information."
  },
  {
    question: "Can I manually edit cost items?",
    answer: "Yes! Click on any cost item to open the detail drawer where you can edit prices, quantities, and add notes. Your changes will be saved and reflected in the project totals."
  },
  {
    question: "How do I export my analysis?",
    answer: "Use the Export buttons on the project detail page. You can export to Excel for detailed data analysis or PDF for professional reports suitable for client presentation."
  },
  {
    question: "What is the AI Chat feature?",
    answer: "The AI Chat allows you to ask questions about your project data. You can inquire about specific cost items, request summaries, or get insights about pricing trends."
  },
  {
    question: "How are benchmark prices determined?",
    answer: "Benchmark prices are sourced from industry databases and updated regularly. They represent typical market rates for construction materials and services in your selected country."
  }
];

const guides = [
  {
    title: "Getting Started",
    description: "Learn the basics of Unit Rate",
    icon: BookOpen,
  },
  {
    title: "Uploading Files",
    description: "How to upload and process cost estimates",
    icon: Upload,
  },
  {
    title: "Understanding Analysis",
    description: "Interpret AI-generated insights",
    icon: BarChart3,
  },
  {
    title: "Handling Issues",
    description: "Resolve flagged cost items",
    icon: AlertTriangle,
  },
];

const Help = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppLayout>
      <PageHeader
        title="Help Center"
        description="Find answers and learn how to use Unit Rate"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Help" },
        ]}
      />

      <div className="p-8 space-y-6">
        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search for help topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Quick Guides */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Quick Guides</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {guides.map((guide) => (
              <Card key={guide.title} className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center gap-3">
                    <div className="p-3 rounded-full bg-primary/10">
                      <guide.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">{guide.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {guide.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileQuestion className="h-5 w-5 text-primary" />
              <CardTitle>Frequently Asked Questions</CardTitle>
            </div>
            <CardDescription>
              Common questions about using Unit Rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredFaqs.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {filteredFaqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-left">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileQuestion className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No results found for "{searchQuery}"</p>
                <p className="text-sm mt-1">Try a different search term</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact Support */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                <CardTitle>Live Chat Support</CardTitle>
              </div>
              <CardDescription>
                Chat with our support team in real-time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled>
                <MessageCircle className="mr-2 h-4 w-4" />
                Start Chat (Coming Soon)
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle>Email Support</CardTitle>
              </div>
              <CardDescription>
                Send us an email and we'll respond within 24 hours
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" asChild>
                <a href="mailto:support@unitrate.app">
                  <Mail className="mr-2 h-4 w-4" />
                  support@unitrate.app
                  <ExternalLink className="ml-2 h-3 w-3" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Help;