import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, FileText, Calendar, User, AlertCircle, CheckCircle } from 'lucide-react';

export default function ExportInventory() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [lastExport, setLastExport] = useState<Date | null>(null);
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleExport = async () => {
    if (!currentUser?.uid) return;
    
    setIsLoading(true);
    setExportStatus('idle');
    
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('https://boxbinapi-iv6wi.ondigitalocean.app/api/export-inventory-pdf', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Export failed with status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = `inventory-export-${new Date().toISOString().split('T')[0]}.pdf`;
      
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setLastExport(new Date());
      setExportStatus('success');
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            {t('export.title')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {t('export.description')}
          </p>
        </div>

        {/* Main Export Card */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center text-lg">
                  <FileText className="h-5 w-5 mr-2 text-slate-700 dark:text-slate-300" />
                  PDF Export
                </CardTitle>
                <CardDescription>
                  Generate a comprehensive PDF report of your current inventory
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs">
                PDF Format
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Export Features */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Export Includes:
                </h4>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-center">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mr-3"></div>
                    All inventory items and quantities
                  </li>
                  <li className="flex items-center">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mr-3"></div>
                    Location and storage details
                  </li>
                  <li className="flex items-center">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mr-3"></div>
                    Item categories and descriptions
                  </li>
                  <li className="flex items-center">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mr-3"></div>
                    Export timestamp and user info
                  </li>
                </ul>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Export Details:
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center text-slate-600 dark:text-slate-400">
                    <User className="h-4 w-4 mr-2" />
                    {currentUser?.displayName || currentUser?.email || 'Current User'}
                  </div>
                  <div className="flex items-center text-slate-600 dark:text-slate-400">
                    <Calendar className="h-4 w-4 mr-2" />
                    {new Date().toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Status Messages */}
            {exportStatus === 'success' && lastExport && (
              <Alert className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  Export completed successfully on {formatDate(lastExport)}
                </AlertDescription>
              </Alert>
            )}

            {exportStatus === 'error' && (
              <Alert className="border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertDescription className="text-red-800 dark:text-red-200">
                  Export failed. Please try again or contact support if the issue persists.
                </AlertDescription>
              </Alert>
            )}

            {/* Export Button */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button 
                onClick={handleExport}
                disabled={isLoading || !currentUser}
                className="flex-1 sm:flex-none h-11"
                size="default"
              >
                <Download className="mr-2 h-4 w-4" />
                {isLoading ? t('export.exporting') : t('export.exportButton')}
              </Button>
              
              {lastExport && (
                <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
                  <span>Last export: {formatDate(lastExport)}</span>
                </div>
              )}
            </div>

            {!currentUser && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You must be logged in to export your inventory.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Additional Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Export Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-2">File Format</h5>
                <p className="text-slate-600 dark:text-slate-400">
                  PDF document optimized for printing and digital viewing
                </p>
              </div>
              <div>
                <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-2">File Size</h5>
                <p className="text-slate-600 dark:text-slate-400">
                  Typically 1-5 MB depending on inventory size
                </p>
              </div>
              <div>
                <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Compatibility</h5>
                <p className="text-slate-600 dark:text-slate-400">
                  Compatible with all PDF viewers and browsers
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}