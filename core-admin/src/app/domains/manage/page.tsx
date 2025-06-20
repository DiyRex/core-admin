'use client';

import React, { useState, useMemo, useEffect, JSX } from 'react';
import { 
  Search, 
  ChevronDown, 
  ChevronRight, 
  MoreHorizontal, 
  Plus,
  Settings,
  Trash2,
  Copy,
  ExternalLink,
  Loader2,
  AlertCircle,
  RefreshCw,
  Edit,
  Eye,
  Server
} from 'lucide-react';

// Shadcn UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

// TypeScript Types
interface DNSRecord {
  id: number;
  type: string;
}

interface Domain {
  id: number;
  name: string;
  master: string | null;
  lastCheck: string | null;
  type: string;
  notifiedSerial: number | null;
  account: string | null;
  created_at: string;
  updated_at: string;
  records: DNSRecord[];
}

interface DomainsApiResponse {
  domains: Domain[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

interface RecordTypeCounts {
  [key: string]: number;
}

const DomainsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [expandedDomains, setExpandedDomains] = useState<Set<number>>(new Set());
  const [domainsData, setDomainsData] = useState<DomainsApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Fetch domains from API
  const fetchDomains = async (isRefresh: boolean = false): Promise<void> => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      
      const response = await fetch('/api/domains');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch domains: ${response.status} ${response.statusText}`);
      }
      
      const data: DomainsApiResponse = await response.json();
      setDomainsData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error('Failed to fetch domains:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  const filteredDomains = useMemo((): Domain[] => {
    if (!domainsData?.domains) return [];
    return domainsData.domains.filter(domain =>
      domain.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, domainsData]);

  const toggleDomainExpansion = (domainId: number): void => {
    const newExpanded = new Set(expandedDomains);
    if (newExpanded.has(domainId)) {
      newExpanded.delete(domainId);
    } else {
      newExpanded.add(domainId);
    }
    setExpandedDomains(newExpanded);
  };

  const getRecordTypeCounts = (records: DNSRecord[]): RecordTypeCounts => {
    const counts: RecordTypeCounts = {};
    records.forEach(record => {
      counts[record.type] = (counts[record.type] || 0) + 1;
    });
    return counts;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleRefresh = (): void => {
    fetchDomains(true);
  };

  const handleDomainAction = (action: string, domain: Domain): void => {
    switch (action) {
      case 'manage':
        console.log('Managing domain:', domain.name);
        // Navigate to domain management page
        break;
      case 'copy':
        navigator.clipboard.writeText(domain.name);
        break;
      case 'view':
        console.log('Viewing records for:', domain.name);
        // Navigate to records view
        break;
      case 'delete':
        if (confirm(`Are you sure you want to delete domain "${domain.name}"?`)) {
          console.log('Deleting domain:', domain.name);
          // API call to delete domain
        }
        break;
      default:
        break;
    }
  };

  const renderRecordTypeBadges = (records: DNSRecord[]): JSX.Element[] => {
    const counts = getRecordTypeCounts(records);
    return Object.entries(counts).map(([type, count]) => (
      <Badge key={type} variant="outline" className="text-xs">
        {type} ({count})
      </Badge>
    ));
  };

  const renderLoadingSkeleton = (): JSX.Element => (
    <div className="space-y-4 p-6">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center space-x-4 p-4">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-6 w-16" />
          <div className="flex space-x-2">
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-6 w-12" />
          </div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex-1 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <Server className="w-8 h-8 mr-3 text-blue-600" />
              Domains
            </h1>
            <p className="text-gray-600 mt-2">Manage your DNS domains and records</p>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={handleRefresh} 
              disabled={loading || refreshing}
              className="flex items-center"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button className="flex items-center">
              <Plus className="w-4 h-4 mr-2" />
              Add Domain
            </Button>
          </div>
        </div>

        {/* Search and Stats */}
        <div className="flex items-center justify-between mb-4">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search domains..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              disabled={loading}
            />
          </div>
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            {loading ? (
              <span className="flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading domains...
              </span>
            ) : domainsData ? (
              <>
                <span>{filteredDomains.length} of {domainsData.totalCount} domains</span>
                <Badge variant="secondary">{domainsData.totalPages} pages</Badge>
              </>
            ) : (
              <span>No data available</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Card className="overflow-hidden">
        {loading ? (
          renderLoadingSkeleton()
        ) : error ? (
          <CardContent className="p-6">
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                <strong>Error loading domains:</strong> {error}
              </AlertDescription>
            </Alert>
            <Button 
              onClick={handleRefresh} 
              className="mt-4"
              variant="outline"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        ) : !domainsData?.domains?.length ? (
          <CardContent className="p-12 text-center">
            <Server className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No domains found</h3>
            <p className="text-gray-500 mb-6">Get started by adding your first domain</p>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Domain
            </Button>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>DNS Records</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDomains.map((domain) => (
                <React.Fragment key={domain.id}>
                  {/* Main domain row */}
                  <TableRow className="cursor-pointer group">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleDomainExpansion(domain.id)}
                        className="p-1 h-auto w-auto hover:bg-gray-200"
                      >
                        {expandedDomains.has(domain.id) ? (
                          <ChevronDown className="w-4 h-4 text-gray-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-600" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <div>
                          <div className="font-semibold text-gray-900">{domain.name}</div>
                          <div className="text-xs text-gray-500">ID: {domain.id}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{domain.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {renderRecordTypeBadges(domain.records)}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      <div className="text-sm">{formatDate(domain.created_at)}</div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleDomainAction('manage', domain)}>
                            <Settings className="w-4 h-4 mr-2" />
                            Manage Domain
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDomainAction('view', domain)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Records
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDomainAction('copy', domain)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Domain Name
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDomainAction('view', domain)}>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Open in New Tab
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDomainAction('delete', domain)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Domain
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>

                  {/* Expanded records row */}
                  {expandedDomains.has(domain.id) && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-gray-50 p-0">
                        <div className="p-6 border-t border-gray-200">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-semibold text-gray-900 flex items-center">
                              <Settings className="w-4 h-4 mr-2" />
                              DNS Records for {domain.name}
                            </h4>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline">
                                <Plus className="w-4 h-4 mr-1" />
                                Add Record
                              </Button>
                              <Button size="sm" variant="outline">
                                <Edit className="w-4 h-4 mr-1" />
                                Bulk Edit
                              </Button>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {Object.entries(getRecordTypeCounts(domain.records)).map(([type, count]) => (
                              <Card key={type} className="p-4 hover:shadow-sm transition-shadow">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-sm text-gray-900">{type} Records</div>
                                    <div className="text-xs text-gray-500 mt-1">
                                      {count} record{count !== 1 ? 's' : ''}
                                    </div>
                                  </div>
                                  <Badge variant="outline" className="text-lg font-semibold">
                                    {count}
                                  </Badge>
                                </div>
                              </Card>
                            ))}
                          </div>
                          
                          {domain.records.length > 4 && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <Button size="sm" variant="ghost" className="w-full">
                                <Eye className="w-4 h-4 mr-2" />
                                View All {domain.records.length} Records
                              </Button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};

export default DomainsPage;