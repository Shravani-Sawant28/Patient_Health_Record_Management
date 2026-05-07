"use client"

import { WalletLogin } from "@/components/wallet-login"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, UserCircle, FlaskConical, ShieldCheck, ArrowRight, Lock, CheckCircle2 } from "lucide-react"

export default function LandingPage() {
  const [showAuth, setShowAuth] = useState(false)
  const [selectedRole, setSelectedRole] = useState<"patient" | "doctor" | "lab" | "admin" | null>(null)

  const roles = [
    {
      id: "patient" as const,
      title: "Patient",
      description: "Securely store and manage your medical records with total control over who can access them.",
      icon: UserCircle,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      features: ["Personal Medical Vault", "Granular Access Control", "AI Health Insights", "Audit Logs"],
    },
    {
      id: "doctor" as const,
      title: "Doctor",
      description: "Access patient records with authorization and contribute clinical notes securely.",
      icon: Activity,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
      features: ["Authorized Access Only", "Clinical Note Uploads", "Patient Search", "Secure Messaging"],
    },
    {
      id: "lab" as const,
      title: "Laboratory",
      description: "Directly upload test results to patient vaults.",
      icon: FlaskConical,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      features: ["Result Direct Upload", "Batch Processing", "Secure Pinned CID", "Interoperable"],
    },
    {
      id: "admin" as const,
      title: "Admin",
      description: "Verify healthcare providers and maintain network integrity and compliance.",
      icon: ShieldCheck,
      color: "text-rose-600",
      bgColor: "bg-rose-50",
      features: ["Provider Verification", "System Audit", "User Management", "Policy Governance"],
    },
  ]

  const handleRoleSelect = (role: typeof selectedRole) => {
    setSelectedRole(role)
    setShowAuth(true)
  }

  if (showAuth) {
    const roleInfo = roles.find((r) => r.id === selectedRole)
    const Icon = roleInfo?.icon ?? Activity

    const handleAdminLogin = async (e: React.FormEvent) => {
      e.preventDefault()
      const formData = new FormData(e.currentTarget as HTMLFormElement)
      const email = formData.get("email")
      const password = formData.get("password")

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Login failed")

        localStorage.setItem("token", data.token)
        localStorage.setItem("user", JSON.stringify(data.user || data.admin))
        window.location.href = "/admin"
      } catch (err: any) {
        alert(err.message)
      }
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <Card className="w-full max-w-md border-none shadow-2xl ring-1 ring-black/5">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl font-bold">Secure Gateway</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowAuth(false); setSelectedRole(null); }}
              >
                ← Back
              </Button>
            </div>
            <CardDescription className="text-foreground/80">
              Connecting as <span className="font-bold capitalize">{selectedRole}</span>.
              Authentication is handled via end-to-end encrypted Web3 identity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className={`flex items-center gap-3 p-4 rounded-xl ${roleInfo?.bgColor} border border-current/10`}>
              <Icon className={`h-6 w-6 ${roleInfo?.color}`} />
              <span className={`font-bold ${roleInfo?.color} uppercase tracking-tight`}>{roleInfo?.title} Portal</span>
            </div>

            <div className="flex justify-center p-6 border-b border-t bg-muted/20">
              {selectedRole === "admin" ? (
                <form onSubmit={handleAdminLogin} className="w-full space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Internal ID</label>
                    <input name="email" type="email" placeholder="admin@healthehr.com" required
                      className="w-full p-3 rounded-lg border bg-background text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Access Key</label>
                    <input name="password" type="password" placeholder="••••" required
                      className="w-full p-3 rounded-lg border bg-background text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none" />
                  </div>
                  <Button type="submit" className="w-full bg-rose-600 hover:bg-rose-700 font-bold mt-2">
                    Access Admin Panel
                  </Button>
                  <p className="text-[10px] text-center text-rose-500 font-bold uppercase tracking-widest">
                    Authorized Personnel Only
                  </p>
                </form>
              ) : (
                <WalletLogin role={selectedRole as any} />
              )}
            </div>

            {(selectedRole === "doctor" || selectedRole === "lab") && (
              <p className="text-[11px] text-muted-foreground bg-muted p-3 rounded-lg leading-relaxed">
                <ShieldCheck className="h-3 w-3 inline mr-1" />
                New professional accounts require verification by the network administrator before clinical privileges are enabled.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-blue-100">
      <header className="border-b border-slate-100 sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-800">Healthify</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            BLOCKCHAIN SECURED
          </div>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-6 py-20 text-center">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-6 leading-[1.1]">
            Decentralized Healthcare<br />
            <span className="text-blue-600">Empowering Every Patient.</span>
          </h1>
          <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
            Take total control of your medical identity. Health records stored on IPFS, accessible only with your permission.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            {[ "IPFS Storage", "AI Powered"].map((tag) => (
              <div key={tag} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {tag}
              </div>
            ))}
          </div>
        </section>

        <section className="container mx-auto px-6 pb-20">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {roles.map((role) => (
              <Card
                key={role.id}
                className="border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group"
                onClick={() => handleRoleSelect(role.id)}
              >
                <CardHeader>
                  <div className={`h-12 w-12 rounded-xl ${role.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <role.icon className={`h-6 w-6 ${role.color}`} />
                  </div>
                  <CardTitle className="flex items-center justify-between text-xl">
                    {role.title}
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                  </CardTitle>
                  <CardDescription className="text-sm font-medium leading-relaxed">{role.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {role.features.map((f) => (
                      <li key={f} className="text-xs font-bold text-slate-400 flex items-center gap-2 uppercase tracking-tight">
                        <div className="h-1 w-1 bg-slate-200 rounded-full" /> {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 py-10 text-center font-bold text-[10px] text-slate-300 uppercase tracking-[0.2em]">
        © 2026 Healthify Network • Decentralized Infrastructure
      </footer>
    </div>
  )
}
