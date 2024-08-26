import React from 'react'
import { NextResponse } from 'next/server'
import OpenAI from "openai"
import { Pinecone } from '@pinecone-database/pinecone'
import axios from 'axios';
import * as cheerio from 'cheerio';
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const systemPrompt = `You are an AI assistant specializing in helping students find professors based on various criteria. Your primary function is to provide the top 3 most relevant professors for each user query using a Retrieval-Augmented Generation (RAG) system.

Your knowledge base includes detailed information about professors, including:
- Teaching style and effectiveness
- Course difficulty and workload
- Grading fairness
- Availability and approachability
- Areas of expertise
- Student reviews and ratings

Capabilities:
1. Process and analyze natural language queries about professors and courses.
2. Access and retrieve relevant information from a comprehensive database of professor reviews and ratings.
3. Rank and recommend professors based on multiple criteria.
4. Provide summaries of professor profiles and student experiences.
5. Offer insights into course difficulty and workload.
6. Compare multiple professors within the same department or across disciplines.
7. Understand and respond to follow-up questions for more detailed information.
8. Recognize and address common student concerns about course selection.

For each user query, follow these steps:
1. Analyze the user's request, identifying key criteria and preferences.
2. Use the RAG system to retrieve relevant information about professors matching the criteria.
3. Evaluate and rank the professors based on how well they match the user's needs.
4. Present the top 3 professors, providing a concise summary for each that includes:
   - Name and department
   - Subject expertise and teaching
   - Overall rating (e.g., 4.5/5)
   - A brief quote from a student review (e.g. reviews)
5. Offer to provide more detailed information about any of the recommended professors if requested.

Guidelines:
1. Objectivity: Maintain a neutral tone and present balanced information about each professor, including both strengths and potential areas for improvement.
2. Relevance: Prioritize information that directly addresses the user's specific query or concerns.
3. Respect: Avoid sharing personal or sensitive information about professors. Focus on their professional qualities and teaching abilities.
4. Clarity: Use clear, concise language to convey information. Avoid jargon unless specifically requested by the user.
5. Sensitivity: Be mindful of potentially controversial topics. Present information factually without endorsing or condemning specific viewpoints.
6. Accuracy: If you're unsure about any information, clearly state that it may not be up-to-date or completely accurate.
7. Follow-up: Encourage users to ask for clarification or additional details if needed.
8. Ethical considerations: Do not recommend professors based on discriminatory criteria (e.g., race, gender, age). Focus on teaching quality and relevant expertise.
9. Context: Consider the academic level (undergraduate, graduate) and field of study when making recommendations.
10. Limitations: Be clear about the limitations of your knowledge. If a query is outside your scope or data range, inform the user and suggest alternative resources.

Your responses should:
1. Be concise yet informative, providing key details without overwhelming the user.
2. Use a friendly and supportive tone, acknowledging the importance of the user's academic decisions.
3. Include specific examples or quotes when relevant to illustrate a point about a professor.
4. Offer comparisons between recommended professors when it adds value to the user's decision-making process.
5. Prompt the user for more information if their initial query is too vague or broad.
6. Provide a brief explanation of your reasoning for each professor recommendation.
7. Include a disclaimer about the subjective nature of student reviews and ratings when appropriate.
8. Suggest follow-up questions the user might want to consider for a more comprehensive understanding.
9. Adapt the level of detail based on whether the user is an undergraduate or graduate student.
10. End with an open-ended question or offer for further assistance to encourage continued engagement.

Remember, your goal is to help students make informed decisions about their course selections by providing accurate, relevant, and helpful information about professors.`
//text.match check if the text has the url
//replace the url with the actually relevant information after scrape
//upsert
//in the embeddings, input put reviews for the ai to understand the how relevant the information is
const extractUrl = (text) => {
    const urlRegex = /https:\/\/www\.ratemyprofessors\.com\/professor\/(\d+)/g;
    return text.match(urlRegex) || []
}
const scrapeProfessorData = async (url) => {
    try {
        const response = await axios.get(url)
        const $ = cheerio.load(response.data)
        const id = url.split('/')[4]
        const professorFirstName = $('div.NameTitle__Name-dowf0z-0 span').first().text().trim()
        const professorLastName = $('div.NameTitle__Name-dowf0z-0 span.NameTitle__LastNameWrapper-dowf0z-2').first().text().trim()
        const professorName = `${professorFirstName} ${professorLastName}`
        const school = $('div.NameTitle__Title-dowf0z-1 a').last().text().trim()
        const subject = $('a.TeacherDepartment__StyledDepartmentLink-fl79e8-0').text().trim()
        const ratingText = $('div.RatingValue__Numerator-qw8sqy-2').text().trim()
        const comments = $('div.Comments__StyledComments-dzzyvm-0').text().trim()
        const review = {
            id: id,
            professor: professorName,
            review: comments,
            subject: subject,
            stars: ratingText,
            school: school
        }
        return review;
    } catch (e) {
        console.log(e)
        return null
    }
}
const replaceUrl = async (text, urls, processedData) => {
    for (let i = 0; i < urls.length; i++) {
        text = text.replace(
            urls[i],
            processedData[i].id + " with name " + processedData[i].metadata.professor + " for " + processedData[i].metadata.subject + " with " + processedData[i].metadata.stars + "/5 star rating at " + processedData[i].metadata.school + " with reviews: " + processedData[i].metadata.review
        );
    }
    return text
}
const upsertPC = async (text, client, PC_index) => {
    const urls = extractUrl(text)
    const processedData = [];
    for (const url of urls) {
        const data = await scrapeProfessorData(url)
        if (!data) continue
        try {
            const response = await client.embeddings.create({
                model: 'text-embedding-3-small',
                input: data.review,
                encoding_format: 'float',
            })
            const embedding = response.data[0].embedding;
            processedData.push({
                values: embedding,
                id: data.id,
                metadata: {
                    professor: data.professor,
                    review: data.review,
                    school: data.school,
                    subject: data.subject,
                    stars: data.stars
                }
            })
        } catch (e) {
            console.log(e, "error")
        }
        try {
            await PC_index.upsert(processedData)
            return replaceUrl(text, urls, processedData)

        } catch (error) {
            console.log(error)

        }
    }
}

export async function POST(req) {
    const data = await req.json()
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const index = pc.index('rag').namespace('ns1')
    const text = data[data.length - 1].content
    const upsertedData = await upsertPC(text, openai, index)
    const embeddingInput = upsertedData != null ? upsertedData : text
    const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: embeddingInput,
        encoding_format: 'float',
    })
    const results = await index.query({
        vector: embedding.data[0].embedding,
        topK: 1,
        includeMetadata: true,
    })
    let resultString = '\n\nReturned results from vector db: (done automatically):'
    results.matches.forEach((match) => {
        resultString += `\n
        Id: ${match.id}
        Professor: ${match.metadata.professor}
        Review: ${match.metadata.review}
        School: ${match.metadata.school}
        Subject: ${match.metadata.subject}
        Stars: ${match.metadata.stars}
        \n\n
        `
    })
    const lastMessage = data[data.length - 1]
    const lastMessageContent = lastMessage.content + resultString
    const lastDataWithoutLastMessage = data.slice(0, data.length - 1)
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt }, ...lastDataWithoutLastMessage,
            { role: 'user', content: lastMessageContent },
        ],
        stream: true,
    })
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder()
            try {
                for await (const chunk of completion) {
                    const content = chunk.choices[0]?.delta?.content
                    if (content) {
                        const text = encoder.encode(content)
                        controller.enqueue(text)
                    }
                }
            } catch (e) {
                controller.error(e)
            } finally {
                controller.close()
            }
        }
    })
    return new NextResponse(stream)
}
