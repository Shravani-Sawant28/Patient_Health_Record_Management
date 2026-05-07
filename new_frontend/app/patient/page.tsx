"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileText, Users, History, LogOut, Eye, Loader2, Activity, ShieldCheck, Download } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { UploadDialog } from "@/components/patient/upload-dialog"
import { formatIdentifier } from "@/lib/utils/format"
import { unwrapAESKey, decryptFile } from "@/lib/crypto"
import { GrantAccessDialog } from "@/components/patient/grant-access-dialog"
import { FollowupsTimelineDialog } from "@/components/dashboard/followups-timeline-dialog"
import { MessageCircle, Calendar, ArrowUpCircle } from "lucide-react"
import { AISummaryPanel } from "@/components/patient/ai-summary-panel"

export default function PatientDashboard() {
  const router = useRouter()
  const { toast } = useToast()
  const [user, setUser] = useState<any>(null)
  const [data, setData] = useState({
    records: [] as any[],
    permissions: [] as any[],
    auditLogs: [] as any[],
    providers: [] as any[],
  })
  const [loading, setLoading] = useState(true)
  const [downloadingRecordId, setDownloadingRecordId] = useState<string | null>(null)

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token")
    return { "Authorization": `Bearer ${token}` }
  }

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    const token = localStorage.getItem("token")

    if (!storedUser || !token) {
      router.push("/")
      return
    }

    const parsedUser = JSON.parse(storedUser)
    if (parsedUser.role !== "patient") {
      router.push("/")
      return
    }

    setUser(parsedUser)
    loadAllData()
  }, [])

  const loadAllData = async () => {
    setLoading(true)
    try {
      const headers = getAuthHeaders()
      const [rec, perm, logs, prov] = await Promise.all([
        fetch("/api/patient/records", { headers }),
        fetch("/api/patient/access/list", { headers }),
        fetch("/api/patient/audit-logs", { headers }),
        fetch("/api/users/search", { headers })
      ])

      const [records, permissions, auditLogs, providers] = await Promise.all([
        rec.json(), perm.json(), logs.json(), prov.json()
      ])

      setData({
        records: records.records || [],
        permissions: permissions.permissions || [],
        auditLogs: auditLogs.logs || [],
        providers: providers.users || [],
      })
    } catch (error) {
      toast({ title: "Sync Failed", description: "Failed to load dashboard data.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleRevokeAccess = async (userId: string) => {
    try {
      const res = await fetch("/api/patient/access/revoke", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      if (!res.ok) throw new Error("Failed to revoke access")

      toast({ title: "Access Revoked", description: "The provider no longer has access." })
      loadAllData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const handleDownload = async (record: any) => {
    if (!user?.blockchainAddress) {
      toast({ title: "Error", description: "User identity not found for decryption.", variant: "destructive" })
      return
    }

    setDownloadingRecordId(record._id)
    try {
      const cid = record.cid || record.fileCID
      if (!cid) throw new Error("File content (CID) not found.")

      toast({ title: "Downloading", description: "Fetching and decrypting your file..." })

      // 1. Fetch from IPFS
      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
      if (!response.ok) throw new Error("Failed to fetch file from IPFS.")
      const encryptedBuffer = await response.arrayBuffer()

      // 2. Decrypt if encrypted
      let finalBuffer = encryptedBuffer
      if (record.encryptedAESKey && record.aesIV) {
        const aesKeyRaw = await unwrapAESKey(record.encryptedAESKey, user.blockchainAddress)
        finalBuffer = await decryptFile(encryptedBuffer, aesKeyRaw, record.aesIV)
      }

      // 3. Trigger Browser Download
      const blob = new Blob([finalBuffer], { type: record.fileType || "application/octet-stream" })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = record.fileName.replace(/\.enc$/i, "")
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({ title: "Success", description: "File downloaded successfully." })
    } catch (error: any) {
      console.error("Download failed:", error)
      toast({ title: "Download Failed", description: error.message, variant: "destructive" })
    } finally {
      setDownloadingRecordId(null)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    router.push("/")
  }

  function FollowupTimelineView() {
    const [followups, setFollowups] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
      const fetchFollowups = async () => {
        try {
          const res = await fetch("/api/followup", { headers: getAuthHeaders() })
          const data = await res.json()
          setFollowups(data.followups || [])
        } catch (e) {
          console.error(e)
        } finally {
          setLoading(false)
        }
      }
      fetchFollowups()
    }, [])

    if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
    if (followups.length === 0) return <p className="text-center text-muted-foreground py-8">No follow-up journey recorded yet.</p>

    return (
      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-200">
        {followups.map((item) => (
          <div key={item._id} className="relative flex items-start gap-6 pl-12">
            <div className="absolute left-0 mt-1 flex h-10 w-10 items-center justify-center rounded-full border bg-white shadow-sm ring-4 ring-slate-50">
              {item.action === "upload" ? (
                <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
              ) : item.action === "observation" ? (
                <MessageCircle className="h-4 w-4 text-purple-500" />
              ) : (
                <Eye className="h-4 w-4 text-blue-500" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start mb-1">
                <div>
                  <p className="font-bold text-sm">{item.doctorName}</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">{item.doctorSpecialization}</p>
                </div>
                <span className="text-[10px] text-muted-foreground font-bold flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(item.timestamp).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-2 p-3 rounded-xl bg-white border shadow-sm italic text-xs text-slate-600">
                "{item.description}"
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    )
  }

  const graphData = data.records
    .map(r => ({
      date: new Date(r.uploadDate).toLocaleDateString(),
      sugar: r.summary?.vitals?.sugarLevel || null,
      weight: r.summary?.vitals?.weight || null,
    }))
    .filter(d => d.sugar || d.weight)
    .reverse()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-none">Health Record Portal</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Owner: <span className="font-medium text-foreground">{formatIdentifier(user?.userId, user?.name, "patient")}</span>
              </p>
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="gap-2 text-muted-foreground hover:text-destructive">
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        <div className="flex flex-wrap gap-4">
          <UploadDialog onUploadSuccess={loadAllData} />
          <GrantAccessDialog onGrantSuccess={loadAllData} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <Tabs defaultValue="records" className="space-y-6">
          <TabsList className="bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="records" className="gap-2 rounded-lg">
              <FileText className="h-4 w-4" /> My Records
            </TabsTrigger>
            <TabsTrigger value="access" className="gap-2 rounded-lg">
              <Users className="h-4 w-4" /> Permissions
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 rounded-lg">
              <History className="h-4 w-4" /> Audit Logs
            </TabsTrigger>
            <TabsTrigger value="trends" className="gap-2 rounded-lg">
              <Activity className="h-4 w-4" /> Health Trends
            </TabsTrigger>
            <TabsTrigger value="followups" className="gap-2 rounded-lg">
              <MessageCircle className="h-4 w-4" /> Clinical Follow-ups
            </TabsTrigger>
          </TabsList>

          <TabsContent value="records">
            <Card className="border-none shadow-sm ring-1 ring-border">
              <CardHeader>
                <CardTitle>Medical Vault</CardTitle>
                <CardDescription>Your end-to-end encrypted medical history</CardDescription>
              </CardHeader>
              <CardContent>
                {data.records.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed rounded-xl">
                    <p className="text-muted-foreground">No records in your vault yet.</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {data.records.map((record) => (
                      <div key={record._id} className="flex items-center justify-between p-4 rounded-xl border bg-card hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 bg-primary/5 rounded-lg flex items-center justify-center">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{record.fileName}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-[10px]">{record.recordType}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(record.uploadDate).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="gap-2"
                          onClick={() => handleDownload(record)}
                          disabled={downloadingRecordId === record._id}
                        >
                          {downloadingRecordId === record._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="access">
            <Card className="border-none shadow-sm ring-1 ring-border">
              <CardHeader>
                <CardTitle>Active Permissions</CardTitle>
                <CardDescription>Providers authorized to access your health data</CardDescription>
              </CardHeader>
              <CardContent>
                {data.permissions.filter(p => p.isActive).length === 0 ? (
                  <p className="text-center py-12 text-muted-foreground italic">No active permissions.</p>
                ) : (
                  <div className="grid gap-4">
                    {data.permissions.filter(p => p.isActive).map((perm) => (
                      <div key={perm._id} className="flex items-center justify-between p-4 rounded-xl border bg-card">
                        <div>
                          <p className="font-semibold">{perm.grantedToUser?.name || "Unknown Provider"}</p>
                          <p className="text-xs text-muted-foreground">
                            {perm.grantedToRole.toUpperCase()} • {perm.accessLevel}
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRevokeAccess(perm.grantedTo)}
                          className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-white border-none shadow-none"
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card className="border-none shadow-sm ring-1 ring-border">
              <CardHeader>
                <CardTitle>Access History</CardTitle>
                <CardDescription>Immutable log of every interaction with your data</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.auditLogs.slice(0, 15).map((log) => (
                    <div key={log._id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {log.action.replace("_", " ")}
                        </Badge>
                        <span>
                          by <span className="font-semibold">{log.performedByUser?.name}</span>
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends">
            <Card className="border-none shadow-sm ring-1 ring-border">
              <CardHeader>
                <CardTitle>Biometric Trends</CardTitle>
                <CardDescription>Extracted from your medical reports</CardDescription>
              </CardHeader>
              <CardContent className="h-[400px]">
                {graphData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No longitudinal data available.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={graphData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)", borderRadius: "8px" }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="sugar" 
                        stroke="var(--destructive)" 
                        strokeWidth={2}
                        name="Sugar"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="weight" 
                        stroke="var(--primary)" 
                        strokeWidth={2}
                        name="Weight"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="followups">
            <Card className="border-none shadow-sm ring-1 ring-border">
              <CardHeader>
                <CardTitle>Professional Follow-up Timeline</CardTitle>
                <CardDescription>Clinical notes and observations recorded by doctors during your care</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-50/50 rounded-2xl p-6 border border-dashed border-slate-200">
                   <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-8 text-center">Interactive Care History</p>
                   <FollowupTimelineView />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
            </Tabs>
          </div>

          <div className="lg:col-span-1">
            <AISummaryPanel records={data.records} />
          </div>
        </div>
      </main>
    </div>
  )
}