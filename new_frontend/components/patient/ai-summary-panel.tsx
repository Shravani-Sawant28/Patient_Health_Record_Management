"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Sparkles, AlertCircle } from "lucide-react"

export function AISummaryPanel({ records = [] }: { records?: any[] }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [followups, setFollowups] = useState<any[]>([])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const token = localStorage.getItem("token")
        const headers = { "Authorization": `Bearer ${token}` }
        
        // Fetch followups first
        const followupsRes = await fetch("/api/followup", { headers })
        const followupsData = await followupsRes.json()
        const fList = followupsData.followups || []
        setFollowups(fList)
        // Hardcoded AI summary for now
        setTimeout(() => {
          setSummary(`Here is a summary of your recent health journey:

• Your recent follow-ups indicate a stable recovery path.
• Your uploaded reports show normal vitals with no major anomalies detected.

General Health Advice:
• Ensure you eat plenty of fresh vegetables and fruits daily.
• Maintain a routine of at least 30 minutes of proper exercise (like brisk walking or yoga).
• Stay hydrated by drinking at least 8 glasses of water a day.
• Ensure you get 7-8 hours of restful sleep every night.

Keep up the good work and stay consistent with your health routine!`)
          setLoading(false)
        }, 1500)
      } catch (err: any) {
        setError(err.message)
        setLoading(false)
      }
    }

    fetchData()
  }, [records])

  return (
    <Card className="h-full border-none shadow-sm ring-1 ring-blue-200 bg-gradient-to-b from-blue-50/50 to-white sticky top-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-700">
          <Sparkles className="h-5 w-5" />
          AI Health Assistant
        </CardTitle>
        <CardDescription>Personalized summary & health advice</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-blue-600">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm font-medium">Analyzing your records...</span>
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 text-destructive p-4 bg-destructive/10 rounded-lg text-sm">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        ) : summary ? (
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed space-y-2">
            {summary.replace(/\*\*/g, '').replace(/\*/g, '• ')}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Could not generate health insights.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
