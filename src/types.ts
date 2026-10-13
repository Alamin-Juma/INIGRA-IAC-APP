export type ResourceType = "object-store" | "queue" | "function";

export interface BaseResource {
  type: ResourceType;
  name: string;
}

export interface ObjectStoreResource extends BaseResource {
  type: "object-store";
}

export interface QueueResource extends BaseResource {
  type: "queue";
}

export interface FunctionResource extends BaseResource {
  type: "function";
  runtime: string;
}

export type ResourceSpec = ObjectStoreResource | QueueResource | FunctionResource;

export interface InputSpec {
  region: string;
  resources: ResourceSpec[];
}

export function parseInput(value: unknown): InputSpec {
  if (!value || typeof value !== "object") {
    throw new Error("Input must be a JSON object");
  }

  const record = value as Record<string, unknown>;
  const region = record.region;
  const resources = record.resources;

  if (typeof region !== "string" || region.trim() === "") {
    throw new Error("region must be a non-empty string");
  }

  if (!Array.isArray(resources)) {
    throw new Error("resources must be an array");
  }

  const parsedResources: ResourceSpec[] = resources.map((r, i) => parseResource(r, i));
  return { region: region.trim(), resources: parsedResources };
}

function parseResource(value: unknown, index: number): ResourceSpec {
  if (!value || typeof value !== "object") {
    throw new Error(`resources[${index}] must be an object`);
  }

  const record = value as Record<string, unknown>;
  const type = record.type;
  const name = record.name;

  if (typeof type !== "string") {
    throw new Error(`resources[${index}].type must be a string`);
  }

  if (typeof name !== "string" || name.trim() === "") {
    throw new Error(`resources[${index}].name must be a non-empty string`);
  }

  if (type === "object-store") {
    return { type, name: name.trim() };
  }

  if (type === "queue") {
    return { type, name: name.trim() };
  }

  if (type === "function") {
    const runtime = record.runtime;
    if (typeof runtime !== "string" || runtime.trim() === "") {
      throw new Error(`resources[${index}].runtime must be a non-empty string for type=function`);
    }
    return { type, name: name.trim(), runtime: runtime.trim() };
  }

  throw new Error(`resources[${index}] has unknown type: ${String(type)}`);
}
