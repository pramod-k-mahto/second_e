"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { 
  Phone, 
  Mail, 
  Users, 
  Calendar, 
  Plus, 
  MessageSquare, 
  MessageCircle,
  MoreHorizontal,
  Search,
  Filter
} from "lucide-react";
import { useInteractions, useLogInteraction } from "@/lib/interactions/queries";
import { InteractionType } from "@/lib/interactions/types";
import { useEmployees } from "@/lib/payroll/queries";
import { api } from "@/lib/api";
import useSWR from "swr";

export default function CommunicationLogsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  
  const { data: interactions, isLoading } = useInteractions(companyId);
  const logInteractionMutation = useLogInteraction();
  const { data: employees } = useEmployees(parseInt(companyId));

  // Fetch customers for the dropdown
  const { data: customers } = useSWR(`/companies/${companyId}/customers`, (url) => api.get(url).then(res => res.data));

  const [showLogForm, setShowLogForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newLog, setNewLog] = useState({
    customer_id: 0,
    employee_id: 0,
    interaction_type: "CALL" as InteractionType,
    notes: "",
    interaction_date: new Date().toISOString().split('T')[0]
  });

  const handleLogInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    await logInteractionMutation.mutateAsync({ 
      companyId, 
      interaction: {
        ...newLog,
        interaction_date: new Date(newLog.interaction_date).toISOString()
      } 
    });
    setNewLog({
      customer_id: 0,
      employee_id: 0,
      interaction_type: "CALL",
      notes: "",
      interaction_date: new Date().toISOString().split('T')[0]
    });
    setShowLogForm(false);
  };

  const getInteractionIcon = (type: InteractionType) => {
    switch (type) {
      case 'CALL': return <Phone className="h-4 w-4 text-blue-500" />;
      case 'EMAIL': return <Mail className="h-4 w-4 text-purple-500" />;
      case 'MEETING': return <Users className="h-4 w-4 text-green-500" />;
      case 'WHATSAPP': return <MessageCircle className="h-4 w-4 text-emerald-500" />;
      default: return <MessageSquare className="h-4 w-4 text-gray-500" />;
    }
  };

  const filteredLogs = interactions?.filter(log => 
    log.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.employee_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.notes.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader 
        title="Communication Logs" 
        subtitle="Track all touchpoints and interactions with your customers."
        closeLink={`/companies/${companyId}`}
        actions={
          <Button onClick={() => setShowLogForm(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Log Interaction
          </Button>
        }
      />

      <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Search logs by customer, employee, or notes..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
      </div>

      {showLogForm && (
        <Card className="p-6 border-blue-200">
          <form onSubmit={handleLogInteraction} className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Log New Interaction</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Customer">
                <select 
                  className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newLog.customer_id}
                  onChange={e => setNewLog({...newLog, customer_id: parseInt(e.target.value)})}
                  required
                >
                  <option value="">Select Customer</option>
                  {customers?.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Staff Member">
                <select 
                  className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newLog.employee_id}
                  onChange={e => setNewLog({...newLog, employee_id: parseInt(e.target.value)})}
                  required
                >
                  <option value="">Select Staff</option>
                  {employees?.map((emp: any) => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Interaction Type">
                <select 
                  className="w-full h-10 px-3 bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newLog.interaction_type}
                  onChange={e => setNewLog({...newLog, interaction_type: e.target.value as InteractionType})}
                  required
                >
                  <option value="CALL">Phone Call</option>
                  <option value="EMAIL">Email</option>
                  <option value="MEETING">Meeting</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="OTHER">Other</option>
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Date">
                <Input 
                  type="date" 
                  value={newLog.interaction_date}
                  onChange={e => setNewLog({...newLog, interaction_date: e.target.value})}
                  required
                />
              </FormField>
              <div className="md:col-span-2">
                <FormField label="Notes / Outcome">
                  <Input 
                    placeholder="Briefly describe what was discussed..."
                    value={newLog.notes}
                    onChange={e => setNewLog({...newLog, notes: e.target.value})}
                    required
                  />
                </FormField>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowLogForm(false)}>Cancel</Button>
              <Button type="submit" disabled={logInteractionMutation.isPending}>
                {logInteractionMutation.isPending ? "Saving..." : "Save Interaction"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading communication logs...</div>
      ) : filteredLogs?.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-dotted">
          <MessageSquare className="h-12 w-12 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500">No interaction logs found</h3>
          <p className="text-gray-400 mt-1">Start tracking customer touchpoints.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLogs?.map((log) => (
            <Card key={log.id} className="p-0 overflow-hidden hover:border-blue-200 transition-colors">
              <div className="flex bg-gray-50/50 border-b px-4 py-3 items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-md border shadow-sm">
                    {getInteractionIcon(log.interaction_type)}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-900">{log.customer_name}</span>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      <span className="font-medium text-blue-600">{log.interaction_type}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(log.interaction_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Logged by</div>
                  <div className="text-sm font-medium text-gray-700">{log.employee_name}</div>
                </div>
              </div>
              <div className="p-4">
                <p className="text-gray-700 leading-relaxed">{log.notes}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
