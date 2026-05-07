"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { 
  Plus, 
  FileText, 
  Link as LinkIcon, 
  Trash2, 
  FolderPlus,
  ExternalLink,
  Search
} from "lucide-react";
import { 
  useResourceGroups, 
  useCreateResourceGroup, 
  useCreateResource, 
  useDeleteResource 
} from "@/lib/resources/queries";
import { ResourceGroup } from "@/lib/resources/types";

export default function ResourceLibraryPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  
  const { data: groups, isLoading } = useResourceGroups(companyId);
  const createGroupMutation = useCreateResourceGroup();
  const createResourceMutation = useCreateResource();
  const deleteResourceMutation = useDeleteResource();

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddResource, setShowAddResource] = useState<{groupId: number} | null>(null);

  const [newGroup, setNewGroup] = useState({ name: "", description: "" });
  const [newResource, setNewResource] = useState({ 
    title: "", 
    description: "", 
    link_url: "",
    file_path: "" 
  });

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    await createGroupMutation.mutateAsync({ companyId, group: newGroup });
    setNewGroup({ name: "", description: "" });
    setShowAddGroup(false);
  };

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddResource) return;
    await createResourceMutation.mutateAsync({ 
      companyId, 
      resource: { ...newResource, group_id: showAddResource.groupId } 
    });
    setNewResource({ title: "", description: "", link_url: "", file_path: "" });
    setShowAddResource(null);
  };

  const handleDeleteResource = async (resourceId: number) => {
    if (confirm("Are you sure you want to delete this resource?")) {
      await deleteResourceMutation.mutateAsync({ companyId, resourceId });
    }
  };

  const filteredGroups = groups?.map(group => ({
    ...group,
    resources: group.resources.filter(r => 
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(group => group.resources.length > 0 || group.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      <PageHeader 
        title="Resource Library" 
        subtitle="Manage and share internal documents, links, and templates."
        closeLink={`/companies/${companyId}`}
        actions={
          <Button onClick={() => setShowAddGroup(true)} className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4" />
            New Group
          </Button>
        }
      />

      <div className="flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Search resources..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {showAddGroup && (
        <Card className="p-6 bg-blue-50 border-blue-200">
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <h3 className="text-lg font-semibold text-blue-900">Create New Resource Group</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField 
                label="Group Name"
                value={newGroup.name} 
                onChange={e => setNewGroup({...newGroup, name: e.target.value})}
                placeholder="e.g. Marketing Materials"
                required
              />
              <FormField 
                label="Description"
                value={newGroup.description} 
                onChange={e => setNewGroup({...newGroup, description: e.target.value})}
                placeholder="Optional categorization details"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowAddGroup(false)}>Cancel</Button>
              <Button type="submit" disabled={createGroupMutation.isPending}>
                {createGroupMutation.isPending ? "Creating..." : "Create Group"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading library...</div>
      ) : filteredGroups?.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed">
          <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-600">No resources found</h3>
          <p className="text-gray-400 mt-2">Start by creating a group and adding resources.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {filteredGroups?.map((group: ResourceGroup) => (
            <div key={group.id} className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    {group.name}
                    <span className="text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {group.resources.length}
                    </span>
                  </h2>
                  {group.description && <p className="text-sm text-gray-500 mt-1">{group.description}</p>}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowAddResource({ groupId: group.id })}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Resource
                </Button>
              </div>

              {showAddResource?.groupId === group.id && (
                <Card className="p-6 bg-green-50 border-green-200">
                  <form onSubmit={handleCreateResource} className="space-y-4">
                    <h3 className="text-lg font-semibold text-green-900">Add Resource to {group.name}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField 
                        label="Title"
                        value={newResource.title} 
                        onChange={e => setNewResource({...newResource, title: e.target.value})}
                        placeholder="e.g. Branding Handbook 2024"
                        required
                      />
                      <FormField 
                        label="URL / Link"
                        value={newResource.link_url} 
                        onChange={e => setNewResource({...newResource, link_url: e.target.value})}
                        placeholder="e.g. https://google.com/docs/..."
                      />
                      <div className="md:col-span-2">
                        <FormField 
                          label="Description"
                          value={newResource.description} 
                          onChange={e => setNewResource({...newResource, description: e.target.value})}
                          placeholder="Briefly describe this resource"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => setShowAddResource(null)}>Cancel</Button>
                      <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white" disabled={createResourceMutation.isPending}>
                        {createResourceMutation.isPending ? "Adding..." : "Add Resource"}
                      </Button>
                    </div>
                  </form>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.resources.map(resource => (
                  <Card key={resource.id} className="p-4 hover:shadow-md transition-shadow group relative">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-gray-50 rounded-lg text-blue-600 border group-hover:bg-blue-50 group-hover:border-blue-200 transition-colors">
                        {resource.link_url ? <LinkIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 truncate">{resource.title}</h4>
                        <p className="text-sm text-gray-500 line-clamp-2 mt-1">{resource.description || "No description provided."}</p>
                        
                        <div className="flex items-center justify-between mt-4">
                          <span className="text-[10px] text-gray-400">Added {new Date(resource.created_at).toLocaleDateString()}</span>
                          <div className="flex gap-1">
                            {resource.link_url && (
                              <a 
                                href={resource.link_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-blue-50 hover:text-blue-700 h-8 w-8 px-0"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleDeleteResource(resource.id)}
                              className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Icons
function BookOpen(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
