// refers to data point returned by event volume endpoint
export interface EventVolumePoint {
    period: string          // refers to either date string for daily, or week string for weekly
    event_count: number     // refers to how many events occurred in that period
}

// types of period
export type PeriodType = 'daily' | 'weekly'

// data point returned by event type endpoint
export interface EventTypePoint {
    cameo_root: string
    cameo_description: string
    event_count: number
}

// structured intent object returned by the LLM and stored in saved_graphs.intent_json
export interface QueryIntent {
    chart_type: string
    signal: string   
    params: Record<string, string | number>
}
