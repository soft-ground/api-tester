import axios from 'axios';

// All backend calls go out through the /api prefix.
// dev: vite proxy → localhost:8472 / prod: nginx → server:3000
export const api = axios.create({
  baseURL: '/api',
  timeout: 40000,
});

// ---- Shared types ----

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';
export type BodyType = 'none' | 'json' | 'form' | 'raw' | 'multipart';

// multipart/form-data parts (text or file). A file part data is base64.
export interface MultipartPart {
  id: string;
  key: string;
  type: 'text' | 'file';
  value?: string;
  filename?: string;
  contentType?: string;
  data?: string; // filled only when sending (file base64)
  enabled?: boolean;
}

export interface AuthConfig {
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
  in?: 'header' | 'query';
}

export interface ApiEndpoint {
  id: string;
  collectionId: string | null;
  name: string;
  method: string;
  baseUrl: string;
  path: string;
  headers: KeyValue[];
  queryParams: KeyValue[];
  bodyType: BodyType;
  bodyTemplate: string | null;
  authType: AuthType;
  authConfig: AuthConfig;
  locked?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EndpointSummary {
  id: string;
  name: string;
  method: string;
  path: string;
  locked?: boolean;
}

export interface Collection {
  id: string;
  name: string;
  order: number;
  parentId: string | null;
  endpoints: EndpointSummary[];
}

export interface HealthResponse {
  status: string;
  db: string;
  time: string;
}

export interface ExecuteResult {
  historyId: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string | null;
  };
  response: {
    status: number | null;
    headers: Record<string, string>;
    body: string | null; // only for text; null for binary → use the download route
    durationMs: number;
    encoding?: 'text' | 'binary' | 'none';
    contentType?: string | null;
    size?: number;
    truncated?: boolean;
  } | null;
  success: boolean;
  error: string | null;
  blocked?: boolean;
  unresolved?: string[];
  errors?: Record<string, string>;
}

export interface VarName {
  name: string;
  source: string;
}

export interface HistoryItem {
  id: string;
  endpointId: string | null;
  folderId: string | null;
  reqMethod: string;
  reqUrl: string;
  resStatus: number | null;
  durationMs: number | null;
  success: boolean;
  error: string | null;
  executedAt: string;
}

export interface HistoryFolder {
  id: string;
  name: string;
  order: number;
  _count?: { histories: number };
}

export interface HistoryDetail extends HistoryItem {
  reqHeaders: Record<string, string>;
  reqBody: string | null;
  resHeaders: Record<string, string>;
  resBody: string | null;
  resBodyEncoding?: 'text' | 'binary' | 'none';
  resContentType?: string | null;
  resSize?: number | null;
  resTruncated?: boolean;
  endpoint?: { id: string; name: string } | null;
}

// Raw response body (text/binary) download/inline URL
export function historyBodyUrl(historyId: string): string {
  return `/api/history/${historyId}/body`;
}

export interface HistoryListResponse {
  items: HistoryItem[];
  total: number;
  take: number;
  skip: number;
}

// ---- health ----
export async function getHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health');
  return data;
}

// ---- collections ----
export async function listCollections(): Promise<Collection[]> {
  const { data } = await api.get<Collection[]>('/collections');
  return data;
}
export async function createCollection(
  name: string,
  parentId?: string | null,
): Promise<Collection> {
  const { data } = await api.post('/collections', { name, parentId });
  return data;
}
export async function updateCollection(id: string, name: string) {
  const { data } = await api.patch(`/collections/${id}`, { name });
  return data;
}
export async function deleteCollection(id: string) {
  await api.delete(`/collections/${id}`);
}
export async function reorderCollections(ids: string[]) {
  await api.post('/collections/reorder', { ids });
}
// Move a group (change parent + optional order). parentId=null moves to the top level.
export async function moveCollection(
  id: string,
  parentId: string | null,
  order?: number,
) {
  const { data } = await api.post(`/collections/${id}/move`, {
    parentId,
    order,
  });
  return data;
}
export async function reorderEndpoints(ids: string[]) {
  await api.post('/endpoints/reorder', { ids });
}
export async function duplicateEndpoint(id: string): Promise<ApiEndpoint> {
  const { data } = await api.post(`/endpoints/${id}/duplicate`);
  return data;
}

// ---- backup (export/import) ----
export interface ImportSummary {
  collections: { added: number; merged: number };
  endpoints: { added: number; skipped: number };
  environments: { added: number; skipped: number };
  variableRules: { added: number; skipped: number };
}
export async function exportBackup(): Promise<any> {
  const { data } = await api.get('/backup/export');
  return data;
}
export async function importBackup(payload: any): Promise<ImportSummary> {
  const { data } = await api.post('/backup/import', payload);
  return data;
}

// ---- import (OpenAPI / curl) ----
export interface OpenapiResult {
  grouped: boolean;
  total: number;
  added: number;
  skipped: number;
  collections: { name: string; added: number; skipped: number }[];
}
export async function importOpenapi(payload: {
  spec?: any;
  url?: string;
  collectionName?: string;
}): Promise<OpenapiResult> {
  const { data } = await api.post('/import/openapi', payload);
  return data;
}
export async function importCurl(payload: {
  curl: string;
  collectionName?: string;
}): Promise<{ collectionId: string; endpoint: ApiEndpoint }> {
  const { data } = await api.post('/import/curl', payload);
  return data;
}

// ---- search ----
export interface SearchResults {
  endpoints: {
    id: string;
    name: string;
    method: string;
    path: string;
    collection?: { id: string; name: string } | null;
  }[];
  scenarios: { id: string; name: string }[];
  history: {
    id: string;
    reqMethod: string;
    reqUrl: string;
    resStatus: number | null;
    executedAt: string;
  }[];
}
export async function search(q: string): Promise<SearchResults> {
  const { data } = await api.get('/search', { params: { q } });
  return data;
}

// ---- endpoints ----
export async function getEndpoint(id: string): Promise<ApiEndpoint> {
  const { data } = await api.get<ApiEndpoint>(`/endpoints/${id}`);
  return data;
}
export async function createEndpoint(
  payload: Partial<ApiEndpoint>,
): Promise<ApiEndpoint> {
  const { data } = await api.post('/endpoints', payload);
  return data;
}
export async function updateEndpoint(
  id: string,
  payload: Partial<ApiEndpoint>,
): Promise<ApiEndpoint> {
  const { data } = await api.patch(`/endpoints/${id}`, payload);
  return data;
}
export async function deleteEndpoint(id: string) {
  await api.delete(`/endpoints/${id}`);
}

// ---- execute ----
export interface ExecutePayload {
  endpointId?: string;
  method: string;
  url: string;
  headers?: KeyValue[];
  queryParams?: KeyValue[];
  bodyType?: BodyType;
  body?: string;
  multipart?: MultipartPart[];
  authType?: AuthType;
  authConfig?: AuthConfig;
}
export async function execute(payload: ExecutePayload): Promise<ExecuteResult> {
  const { data } = await api.post<ExecuteResult>('/execute', payload);
  return data;
}

// ---- environments ----
export interface Environment {
  id: string;
  name: string;
  isActive: boolean;
  isShared?: boolean;
  variables: Record<string, string>;
}
export async function listEnvironments(): Promise<Environment[]> {
  const { data } = await api.get<Environment[]>('/environments');
  return data;
}
export async function createEnvironment(
  payload: Partial<Environment>,
): Promise<Environment> {
  const { data } = await api.post('/environments', payload);
  return data;
}
export async function updateEnvironment(
  id: string,
  payload: Partial<Environment>,
): Promise<Environment> {
  const { data } = await api.patch(`/environments/${id}`, payload);
  return data;
}
export async function activateEnvironment(id: string): Promise<Environment> {
  const { data } = await api.post(`/environments/${id}/activate`);
  return data;
}
export async function deleteEnvironment(id: string) {
  await api.delete(`/environments/${id}`);
}
export async function reorderEnvironments(ids: string[]) {
  await api.post('/environments/reorder', { ids });
}
// Save a value captured from a response as an active environment variable
export async function setActiveEnvVariable(
  name: string,
  value: string,
): Promise<Environment> {
  const { data } = await api.post('/environments/active/variables', {
    name,
    value,
  });
  return data;
}

// ---- variable rules ----
export type VariableType =
  | 'fixed'
  | 'sequence'
  | 'expression'
  | 'timestamp'
  | 'uuid'
  | 'random';

export interface VariableRule {
  id: string;
  name: string;
  type: VariableType;
  config: Record<string, any>;
  state: Record<string, any>;
}
export async function listRules(): Promise<VariableRule[]> {
  const { data } = await api.get<VariableRule[]>('/variables');
  return data;
}
export async function createRule(
  payload: Partial<VariableRule>,
): Promise<VariableRule> {
  const { data } = await api.post('/variables', payload);
  return data;
}
export async function updateRule(
  id: string,
  payload: Partial<VariableRule>,
): Promise<VariableRule> {
  const { data } = await api.patch(`/variables/${id}`, payload);
  return data;
}
export async function deleteRule(id: string) {
  await api.delete(`/variables/${id}`);
}
export async function reorderRules(ids: string[]) {
  await api.post('/variables/reorder', { ids });
}
export async function getAvailableNames(): Promise<VarName[]> {
  const { data } = await api.get<VarName[]>('/variables/available');
  return data;
}
export async function previewRule(payload: {
  id?: string;
  type?: string;
  config?: Record<string, any>;
}): Promise<{ value: string }> {
  const { data } = await api.post('/variables/preview', payload);
  return data;
}

// ---- scenarios ----
export interface Extract {
  name: string;
  path: string;
}
export interface Assert {
  target: 'status' | 'body';
  path?: string;
  op: 'eq' | 'ne' | 'contains' | 'exists' | 'gt' | 'lt';
  value?: string;
}
export interface StepOverrides {
  body?: string; // Request body (JSON) override used only for this step
}
export interface ScenarioStep {
  id: string;
  order: number;
  endpointId: string;
  endpoint: { id: string; name: string; method: string };
  extracts: Extract[];
  asserts: Assert[];
  overrides?: StepOverrides;
}
export interface ScenarioSummary {
  id: string;
  name: string;
  desc?: string | null;
  _count?: { steps: number; runs: number };
}
export type DataRow = Record<string, string>;
export interface ScenarioDetail extends ScenarioSummary {
  steps: ScenarioStep[];
  data?: DataRow[]; // Table for data-driven iteration (array of rows)
}
export interface AssertResult extends Assert {
  actual: unknown;
  passed: boolean;
}
export interface StepResult {
  stepId: string;
  order: number;
  endpointName: string;
  method: string;
  url: string;
  historyId: string | null;
  status: number | null;
  durationMs: number | null;
  ok: boolean;
  callOk: boolean;
  blocked: boolean;
  error: string | null;
  extracted: Record<string, string>;
  asserts: AssertResult[];
}
export interface IterationResult {
  index: number;
  row: DataRow;
  ok: boolean;
  results: StepResult[];
}
export interface DataDrivenResults {
  dataDriven: true;
  total: number;
  passed: number;
  failed: number;
  iterations: IterationResult[];
}
export interface ScenarioRun {
  id: string;
  scenarioId: string;
  status: 'running' | 'passed' | 'failed';
  // An array of step results for a single run, or an iteration-result object for data-driven runs
  results: StepResult[] | DataDrivenResults;
  startedAt: string;
  finishedAt: string | null;
}
// Determine whether it is a data-driven result
export function isDataDriven(
  r: StepResult[] | DataDrivenResults | undefined | null,
): r is DataDrivenResults {
  return !!r && !Array.isArray(r) && (r as DataDrivenResults).dataDriven === true;
}

export async function listScenarios(): Promise<ScenarioSummary[]> {
  const { data } = await api.get('/scenarios');
  return data;
}
export async function getScenario(id: string): Promise<ScenarioDetail> {
  const { data } = await api.get(`/scenarios/${id}`);
  return data;
}
export async function createScenario(name: string): Promise<ScenarioSummary> {
  const { data } = await api.post('/scenarios', { name });
  return data;
}
export async function updateScenario(
  id: string,
  payload: { name?: string; desc?: string; data?: DataRow[] },
) {
  const { data } = await api.patch(`/scenarios/${id}`, payload);
  return data;
}
export async function deleteScenario(id: string) {
  await api.delete(`/scenarios/${id}`);
}
export async function addStep(scenarioId: string, endpointId: string): Promise<ScenarioStep> {
  const { data } = await api.post(`/scenarios/${scenarioId}/steps`, { endpointId });
  return data;
}
export async function updateStep(
  stepId: string,
  payload: { extracts?: Extract[]; asserts?: Assert[]; overrides?: StepOverrides },
) {
  const { data } = await api.patch(`/scenarios/steps/${stepId}`, payload);
  return data;
}
export async function deleteStep(stepId: string) {
  await api.delete(`/scenarios/steps/${stepId}`);
}
export async function reorderSteps(scenarioId: string, ids: string[]) {
  await api.post(`/scenarios/${scenarioId}/steps/reorder`, { ids });
}
export async function runScenario(id: string): Promise<ScenarioRun> {
  const { data } = await api.post(`/scenarios/${id}/run`);
  return data;
}
export async function listRuns(scenarioId: string): Promise<ScenarioRun[]> {
  const { data } = await api.get(`/scenarios/${scenarioId}/runs`);
  return data;
}

// ---- history ----
export async function listHistory(
  params: Record<string, string> = {},
): Promise<HistoryListResponse> {
  const { data } = await api.get<HistoryListResponse>('/history', { params });
  return data;
}
export async function getHistory(id: string): Promise<HistoryDetail> {
  const { data } = await api.get<HistoryDetail>(`/history/${id}`);
  return data;
}
// ---- history folders ----
export async function listHistoryFolders(): Promise<HistoryFolder[]> {
  const { data } = await api.get<HistoryFolder[]>('/history/folders');
  return data;
}
export async function createHistoryFolder(name: string): Promise<HistoryFolder> {
  const { data } = await api.post('/history/folders', { name });
  return data;
}
export async function renameHistoryFolder(id: string, name: string) {
  await api.patch(`/history/folders/${id}`, { name });
}
export async function deleteHistoryFolder(id: string) {
  await api.delete(`/history/folders/${id}`);
}
export async function moveHistory(ids: string[], folderId: string | null) {
  await api.post('/history/move', { ids, folderId });
}
export async function deleteHistory(ids: string[]) {
  await api.post('/history/delete', { ids });
}
