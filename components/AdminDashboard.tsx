import React, { useState } from 'react';
import Card from './common/Card';
import Button from './common/Button';
import { ChartBarIcon } from './common/icons';
import { generateAnalyticsReport } from '../services/geminiService';
import { getAllTransactions } from '../services/paymentService';
import { marked } from 'marked';
import type { User } from '../types';

interface AdminDashboardProps {
  user: User | null;
  onLogin: (user: User) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ user }) => {
  const [reportInput, setReportInput] = useState('');
  const [reportResult, setReportResult] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  const handleFetchLiveStats = async () => {
      try {
          const transactions = await getAllTransactions();
          if (transactions) {
              setReportInput(JSON.stringify(transactions, null, 2));
          }
      } catch (error) {
          console.error(error);
          alert("Failed to fetch transactions");
      }
  };

  const handleGenerateReport = async () => {
      if (!reportInput) return;
      setReportLoading(true);
      try {
          const report = await generateAnalyticsReport(reportInput);
          setReportResult(report);
      } catch (error) {
          console.error(error);
          setReportResult("Error generating report.");
      } finally {
          setReportLoading(false);
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-100 rounded-full text-blue-700">
           <ChartBarIcon className="w-8 h-8" />
        </div>
        <div>
           <h2 className="text-2xl font-bold text-gray-800">Admin Dashboard</h2>
           <p className="text-gray-600">Platform overview and AI analytics.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Executive Analytics Agent */}
        <Card className="border-t-4 border-blue-500">
            <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-blue-100 rounded-full text-blue-700">
                    <ChartBarIcon className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-gray-800">Executive Reporting Agent</h3>
                    <p className="text-gray-600">Analyze WoW growth, Day-of-Week trends, and provider performance.</p>
                </div>
            </div>

            <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">Data Source (JSON or CSV)</label>
                    <button onClick={handleFetchLiveStats} className="text-xs text-blue-600 hover:underline font-bold">
                        Fetch Live DB Data
                    </button>
                </div>
                <textarea 
                    value={reportInput}
                    onChange={(e) => setReportInput(e.target.value)}
                    rows={8}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs font-mono bg-gray-50 mb-3"
                    placeholder="Click 'Fetch Live DB Data' or paste CSV/JSON here..."
                />
                <Button onClick={handleGenerateReport} isLoading={reportLoading} className="bg-blue-600 hover:bg-blue-700 w-full mb-4">
                    Generate Executive Report
                </Button>

                {reportResult && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mt-auto max-h-96 overflow-y-auto">
                         <div 
                            className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-p:text-gray-600 prose-strong:text-gray-900" 
                            dangerouslySetInnerHTML={{ __html: marked.parse(reportResult) as string }} 
                        />
                    </div>
                )}
            </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
