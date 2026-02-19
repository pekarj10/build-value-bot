
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Button variant="ghost" asChild className="mb-6 -ml-2">
            <Link to="/help">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Help
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground mt-2">Last updated: February 19, 2026</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              Unit Rate ("we", "our", or "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, store, and share information when you use our construction cost estimation platform. Please read this policy carefully.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed font-medium">Account Information</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Full name and email address when you register</li>
              <li>Company name (optional, provided in settings)</li>
              <li>Password (stored in encrypted form, never readable)</li>
            </ul>

            <p className="text-muted-foreground leading-relaxed font-medium mt-4">Project Data</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Files you upload (spreadsheets, cost schedules)</li>
              <li>Project names, types, and configurations</li>
              <li>Cost items, quantities, and estimates you create or import</li>
              <li>Notes and annotations you add to projects</li>
            </ul>

            <p className="text-muted-foreground leading-relaxed font-medium mt-4">Usage Information</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Actions taken within the application (for audit and mutation history)</li>
              <li>Browser type and device information</li>
              <li>IP address (retained for security and audit logging)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use the information we collect to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process and analyse your project cost data</li>
              <li>Match your cost items against benchmark data</li>
              <li>Send you important notifications about your account or projects</li>
              <li>Respond to your questions and support requests</li>
              <li>Maintain security and detect fraudulent activity</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We do not use your project data for training AI models or benchmarking unless you explicitly consent to sharing anonymised data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Data Storage and Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is stored securely using industry-standard encryption at rest and in transit. We implement row-level security controls so that each user can only access their own data. Uploaded files are stored in a secure, access-controlled environment.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              While we take reasonable measures to protect your data, no method of electronic storage is 100% secure. We encourage you to use a strong, unique password and enable any available security features.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Data Sharing</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell your personal data. We may share data with:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li><span className="text-foreground font-medium">Service providers:</span> Infrastructure and cloud providers who process data on our behalf under strict confidentiality agreements</li>
              <li><span className="text-foreground font-medium">AI providers:</span> When you use AI analysis features, cost item descriptions may be sent to AI model providers for processing. This is limited to the data needed to perform the analysis.</li>
              <li><span className="text-foreground font-medium">Legal obligations:</span> If required by law, court order, or governmental authority</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your account and project data for as long as your account is active. If you delete your account, we will delete your personal data within 30 days, except where we are legally required to retain it for a longer period.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Audit logs (mutation history, IP addresses) may be retained for up to 12 months for security and compliance purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              Depending on your location, you may have the following rights regarding your personal data:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-muted-foreground">
              <li><span className="text-foreground font-medium">Access:</span> Request a copy of the data we hold about you</li>
              <li><span className="text-foreground font-medium">Correction:</span> Request correction of inaccurate data</li>
              <li><span className="text-foreground font-medium">Deletion:</span> Request deletion of your personal data</li>
              <li><span className="text-foreground font-medium">Portability:</span> Request your data in a machine-readable format</li>
              <li><span className="text-foreground font-medium">Objection:</span> Object to certain types of processing</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              To exercise any of these rights, please contact us through the Help section.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Cookies and Tracking</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use essential cookies and local storage to maintain your session and preferences (such as view mode and filters). We do not use third-party advertising or tracking cookies. You can clear your browser storage at any time, though this will log you out and reset your preferences.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is not intended for use by anyone under the age of 16. We do not knowingly collect personal data from children. If you believe a child has provided us with their data, please contact us and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of significant changes by email or via an in-app notice. The "Last updated" date at the top of this page reflects when the policy was last revised.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us through the Help section of the application.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row gap-4">
          <Button variant="outline" asChild>
            <Link to="/terms">View Terms of Service</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/help">Back to Help</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
