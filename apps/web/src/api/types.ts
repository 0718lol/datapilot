export interface ColumnInfo {
  name: string;
  type: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
}

export interface DataSource {
  id: string;
  name: string;
  original_name: string;
  kind: "csv" | "database";
  row_count: number;
  tables: TableInfo[];
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export interface ChartSpec {
  kind: "bar" | "line" | "table";
  xField?: string;
  yFields?: string[];
  data?: Record<string, unknown>[];
}

export interface AssistantContent {
  question?: string;
  explanation?: string;
  sql?: string | null;
  chartSpec?: ChartSpec | null;
  columns?: string[];
  rows?: unknown[][];
  rowCount?: number;
  error?: { stage: string; message: string } | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: { text?: string } & Partial<AssistantContent>;
}

export type SSEEvent =
  | { type: "status"; stage: string; label: string }
  | { type: "token"; text: string }
  | { type: "sql"; sql: string; explanation: string }
  | { type: "result"; columns: string[]; rows: unknown[][]; row_count: number }
  | { type: "chart"; spec: ChartSpec }
  | { type: "error"; stage: string; message: string }
  | { type: "done" };

export interface ModelSettings {
  provider: string;
  base_url: string | null;
  model: string;
  key_configured: boolean;
}

export interface EvalItem {
  id: string;
  question: string;
  gold_sql: string;
  note: string;
  created_at: string;
}

export interface EvalRunItem {
  question: string;
  gold_sql: string;
  generated_sql?: string | null;
  explanation?: string;
  passed: boolean;
  failure?: string;
  gold_row_count?: number;
}

export interface EvalReport {
  datasource_id: string;
  total: number;
  passed: number;
  accuracy: number;
  items: EvalRunItem[];
}

export interface DatabaseConnectForm {
  name: string;
  type: "postgres" | "mysql" | "sqlite";
  host: string;
  port: number | null;
  database: string;
  username: string;
  password: string;
}

export interface DashboardItem {
  id: string;
  title: string;
  datasource_id: string;
  datasource_name: string;
  sql: string;
  chart_hint: string;
  created_at: string;
}

export interface DashboardData {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  chartSpec: ChartSpec;
}

export interface TablePreview {
  columns: string[];
  rows: unknown[][];
  total_rows: number | null;
}
