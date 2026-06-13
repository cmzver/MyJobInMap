import type { components } from './api.generated'

// Organization model and write payloads are derived from the backend OpenAPI
// schema (single source of truth) — regenerate with `npm run gen:api`.
export type Organization = components['schemas']['OrganizationResponse']
export type CreateOrganizationData = components['schemas']['OrganizationCreate']
export type UpdateOrganizationData = components['schemas']['OrganizationUpdate']
export type AssignUserData = components['schemas']['AssignUserRequest']
