import { type NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { requireRole } from "@/lib/auth/middleware"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ["patient"])
    
    const { followups, records } = await req.json()

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 })
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

    // Extract minimal fields from records to avoid huge payload
    const summarizedRecords = (records || []).map((r: any) => ({
      fileName: r.fileName,
      recordType: r.recordType,
      description: r.description,
      uploadDate: r.uploadDate,
      summary: r.summary,
    }))

    const hasData = (followups && followups.length > 0) || (summarizedRecords && summarizedRecords.length > 0);

    const prompt = hasData ? `
      You are a caring medical assistant providing advice to a patient. 
      Below is a list of clinical follow-ups and notes recorded by doctors for this patient:
      ${JSON.stringify(followups || [])}

      Below is a list of medical records and reports uploaded by the patient (including their descriptions and summaries):
      ${JSON.stringify(summarizedRecords)}
      
      Based on these past followups, records, and descriptions, please provide:
      1. A brief summary of their past followups, reports, and overall medical journey.
      2. Regular, friendly, and practical health advice (e.g., eat fresh vegetables, exercise properly, stay hydrated) tailored to their history.
      
      Keep it encouraging and easy to read. Use bullet points and paragraphs where appropriate.
    ` : `
      You are a caring medical assistant. The patient currently does not have any clinical follow-ups or uploaded medical records.
      
      Please provide:
      1. A welcoming message acknowledging they are starting fresh.
      2. General health awareness and regular, friendly, practical health advice (e.g., eating fresh vegetables, maintaining proper exercise, staying hydrated, getting enough sleep).
      
      Keep it encouraging and easy to read. Use bullet points and paragraphs where appropriate.
    `

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    return NextResponse.json({ summary: text })
  } catch (error: any) {
    console.error("[AI Advice API] Error:", error)
    return NextResponse.json({ error: "Failed to generate AI advice" }, { status: 500 })
  }
}
