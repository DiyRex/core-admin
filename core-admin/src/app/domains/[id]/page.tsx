'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Search, 
  Plus,
  Settings,
  Trash2,
  Edit,
  Save,
  X,
  ArrowLeft,
  Server,
  Globe,
  Clock,
  Shield,
  AlertCircle,
  Loader2,
  RefreshCw,
  Filter,
  SortAsc,
  SortDesc,
  ExternalLink,
  Copy,
  CheckCircle
} from 'lucide-react';

// Shadcn UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

// TypeScript Types
interface DNSRecord {
  id: number;
  domainId: number;
  name: string;
  type: string;
  content: string;
  ttl: number;
  prio: number | null;
  disabled: boolean;
  ordername: string | null;
  auth: boolean;
  createdBy: string;
  comment: string | null;
  created_at: string;
  updated_at: string;
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

interface RecordFormData {
  name: string;
  type: string;
  content: string;
  ttl: number;
  prio: number | null;
  comment: string;
  disabled: boolean;
}

type SortField = 'name' | 'type' | 'content' | 'ttl' | 'created_at';
type SortDirection = 'asc' | 'desc';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'SOA', 'TXT', 'SRV', 'PTR'];
const TTL_OPTIONS = [
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 7200, label: '2 hours' },
  { value: 14400, label: '4 hours' },
  { value: 28800, label: '8 hours' },
  { value: 43200, label: '12 hours' },
  { value: 86400, label: '1 day' },
];

const DomainRecordsPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const domainId = params?.id as string;

  // State management
  const [domain, setDomain] = useState<Domain | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Form state
  const [formData, setFormData] = useState<RecordFormData>({
    name: '',
    type: 'A',
    content: '',
    ttl: 3600,
    prio: null,
    comment: '',
    disabled: false,
  });

  // Fetch domain data
  const fetchDomainData = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/domains/${domainId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch domain: ${response.status} ${response.statusText}`);
      }
      
      const data: Domain = await response.json();
      setDomain(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error('Failed to fetch domain:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (domainId) {
      fetchDomainData();
    }
  }, [domainId]);

  // Filtered and sorted records
  const filteredAndSortedRecords = useMemo(() => {
    if (!domain?.records) return [];

    let filtered = domain.records.filter(record => {
      const matchesSearch = 
        record.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.type.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = typeFilter === 'all' || record.type === typeFilter;
      
      return matchesSearch && matchesType;
    });

    // Sort records
    filtered.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === 'created_at') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [domain?.records, searchTerm, typeFilter, sortField, sortDirection]);

  // Get unique record types for filter
  const recordTypes = useMemo(() => {
    if (!domain?.records) return [];
    const types = [...new Set(domain.records.map(record => record.type))];
    return types.sort();
  }, [domain?.records]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      type: 'A',
      content: '',
      ttl: 3600,
      prio: null,
      comment: '',
      disabled: false,
    });
  };

  // Handle add record
  const handleAddRecord = async () => {
    try {
      setSaving(true);
      
      const response = await fetch(`/api/domains/${domainId}/records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to add record');
      }

      await fetchDomainData(); // Refresh data
      setIsAddDialogOpen(false);
      resetForm();
    } catch (err) {
      console.error('Failed to add record:', err);
    } finally {
      setSaving(false);
    }
  };

  // Handle edit record
  const handleEditRecord = (record: DNSRecord) => {
    setEditingRecord(record);
    setFormData({
      name: record.name,
      type: record.type,
      content: record.content,
      ttl: record.ttl,
      prio: record.prio,
      comment: record.comment || '',
      disabled: record.disabled,
    });
    setIsEditDialogOpen(true);
  };

  // Handle update record
  const handleUpdateRecord = async () => {
    if (!editingRecord) return;

    try {
      setSaving(true);
      
      const response = await fetch(`/api/domains/${domainId}/records/${editingRecord.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to update record');
      }

      await fetchDomainData(); // Refresh data
      setIsEditDialogOpen(false);
      setEditingRecord(null);
      resetForm();
    } catch (err) {
      console.error('Failed to update record:', err);
    } finally {
      setSaving(false);
    }
  };

  // Handle delete record
  const handleDeleteRecord = async (recordId: number) => {
    if (!confirm('Are you sure you want to delete this record?')) return;

    try {
      const response = await fetch(`/api/domains/${domainId}/records/${recordId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete record');
      }

      await fetchDomainData(); // Refresh data
    } catch (err) {
      console.error('Failed to delete record:', err);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format TTL
  const formatTTL = (ttl: number): string => {
    const option = TTL_OPTIONS.find(opt => opt.value === ttl);
    return option ? option.label : `${ttl}s`;
  };

  // Record form component
  const RecordForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="www"
          />
        </div>
        <div>
          <Label htmlFor="type">Type</Label>
          <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECORD_TYPES.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="content">Content</Label>
        <Input
          id="content"
          value={formData.content}
          onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
          placeholder={formData.type === 'A' ? '192.168.1.1' : 'example.com'}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ttl">TTL</Label>
          <Select value={formData.ttl.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, ttl: parseInt(value) }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TTL_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value.toString()}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(formData.type === 'MX' || formData.type === 'SRV') && (
          <div>
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              type="number"
              value={formData.prio || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, prio: e.target.value ? parseInt(e.target.value) : null }))}
              placeholder="10"
            />
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="comment">Comment (Optional)</Label>
        <Textarea
          id="comment"
          value={formData.comment}
          onChange={(e) => setFormData(prev => ({ ...prev, comment: e.target.value }))}
          placeholder="Add a comment..."
          rows={3}
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="disabled"
          checked={formData.disabled}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, disabled: checked }))}
        />
        <Label htmlFor="disabled">Disabled</Label>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex-1 p-6 bg-gray-50 min-h-screen">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-6 bg-gray-50 min-h-screen">
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            <strong>Error loading domain:</strong> {error}
          </AlertDescription>
        </Alert>
        <Button onClick={fetchDomainData} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="flex-1 p-6 bg-gray-50 min-h-screen">
        <div className="text-center">
          <p>Domain not found</p>
          <Button onClick={() => router.back()} variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center mb-4">
          <Button 
            variant="ghost" 
            onClick={() => router.push('/domains')}
            className="mr-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Domains
          </Button>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <Globe className="w-8 h-8 mr-3 text-blue-600" />
              {domain.name}
            </h1>
            <div className="flex items-center space-x-4 mt-2">
              <Badge variant="secondary">{domain.type}</Badge>
              <span className="text-sm text-gray-600">ID: {domain.id}</span>
              <span className="text-sm text-gray-600">
                Created: {formatDate(domain.created_at)}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={fetchDomainData} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Record
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add DNS Record</DialogTitle>
                  <DialogDescription>
                    Add a new DNS record to {domain.name}
                  </DialogDescription>
                </DialogHeader>
                <RecordForm />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddRecord} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Add Record
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {recordTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-gray-600">
            {filteredAndSortedRecords.length} of {domain.records.length} records
          </div>
        </div>
      </div>

      {/* Records Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center">
                  Name
                  {sortField === 'name' && (
                    sortDirection === 'asc' ? 
                    <SortAsc className="w-4 h-4 ml-1" /> : 
                    <SortDesc className="w-4 h-4 ml-1" />
                  )}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('type')}
              >
                <div className="flex items-center">
                  Type
                  {sortField === 'type' && (
                    sortDirection === 'asc' ? 
                    <SortAsc className="w-4 h-4 ml-1" /> : 
                    <SortDesc className="w-4 h-4 ml-1" />
                  )}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('content')}
              >
                <div className="flex items-center">
                  Content
                  {sortField === 'content' && (
                    sortDirection === 'asc' ? 
                    <SortAsc className="w-4 h-4 ml-1" /> : 
                    <SortDesc className="w-4 h-4 ml-1" />
                  )}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('ttl')}
              >
                <div className="flex items-center">
                  TTL
                  {sortField === 'ttl' && (
                    sortDirection === 'asc' ? 
                    <SortAsc className="w-4 h-4 ml-1" /> : 
                    <SortDesc className="w-4 h-4 ml-1" />
                  )}
                </div>
              </TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('created_at')}
              >
                <div className="flex items-center">
                  Created
                  {sortField === 'created_at' && (
                    sortDirection === 'asc' ? 
                    <SortAsc className="w-4 h-4 ml-1" /> : 
                    <SortDesc className="w-4 h-4 ml-1" />
                  )}
                </div>
              </TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedRecords.map((record) => (
              <TableRow key={record.id} className="group">
                <TableCell className="font-medium">
                  <div className="flex items-center">
                    <span className="mr-2">{record.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                      onClick={() => copyToClipboard(record.name)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{record.type}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center max-w-xs">
                    <span className="truncate mr-2">{record.content}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                      onClick={() => copyToClipboard(record.content)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{formatTTL(record.ttl)}</span>
                </TableCell>
                <TableCell>
                  {record.prio ? (
                    <Badge variant="secondary">{record.prio}</Badge>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    {record.disabled ? (
                      <Badge variant="destructive" className="text-xs">Disabled</Badge>
                    ) : (
                      <Badge variant="default" className="text-xs">Active</Badge>
                    )}
                    {record.auth && (
                      <Shield className="w-3 h-3 text-green-600" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {formatDate(record.created_at)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditRecord(record)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Record
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyToClipboard(`${record.name} ${record.type} ${record.content}`)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Record
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleDeleteRecord(record.id)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Record
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredAndSortedRecords.length === 0 && (
          <div className="p-8 text-center">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No records found</h3>
            <p className="text-gray-500 mb-4">
              {searchTerm || typeFilter !== 'all' 
                ? 'Try adjusting your search or filter criteria'
                : 'This domain has no DNS records yet'
              }
            </p>
            {(!searchTerm && typeFilter === 'all') && (
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Record
                  </Button>
                </DialogTrigger>
              </Dialog>
            )}
          </div>
        )}
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit DNS Record</DialogTitle>
            <DialogDescription>
              Update the DNS record for {domain.name}
            </DialogDescription>
          </DialogHeader>
          <RecordForm isEdit />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateRecord} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Update Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DomainRecordsPage;