import type { CompletionReport, RenderAuditEntry } from './types';
import { money } from './geometry';

export default function CompletenessPanel({
  report,
  audit,
}: {
  report?: CompletionReport | null;
  audit: RenderAuditEntry[];
}) {
  if (!report) return null;
  const rendered = new Set(
    audit
      .filter(
        (item) => item.status === 'rendered' && item.assetStatus !== 'loading',
      )
      .map((item) => item.id),
  );
  return (
    <details className="completeness-panel" data-testid="design-completeness">
      <summary>
        {report.complete
          ? 'Design requirements satisfied'
          : 'Design needs review'}{' '}
        · {report.placed_count}/{report.requested_count} requested
        items/features
      </summary>
      <p>
        {report.profile_id && `Style profile: ${report.profile_id}. `}
        {report.user_requirements_complete !== undefined &&
          `Explicit requests ${report.user_requirements_complete ? 'satisfied' : 'need review'}. `}
        {money(report.total_mad)} / {money(report.budget_mad)} MAD sample
        estimate · {report.within_budget ? 'Within budget' : 'Over budget'} ·
        Geometry {report.geometry_valid ? 'valid' : 'needs correction'}
      </p>
      <ul>
        {report.items.map((item) => (
          <li key={item.requirement_id}>
            <strong>{item.name}</strong>
            {item.origin === 'template' ? ' (style suggestion)' : ''}:{' '}
            {item.placed}/{item.requested} placed · {item.validation_status}
            {item.placed > 0 &&
              ` · ${item.object_ids.every((id) => rendered.has(id)) ? 'rendered in 3D' : '3D verification pending'}`}
            {item.reason && (
              <span className="missing-reason">{item.reason}</span>
            )}
          </li>
        ))}
      </ul>
      {!!report.template_items?.length && (
        <details>
          <summary>Room template comparison</summary>
          <ul>
            {report.template_items.map((item) => (
              <li key={item.requirement_id}>
                {item.name}: {item.placed}/{item.requested} ·{' '}
                {item.validation_status}
                {item.reason && (
                  <span className="missing-reason">{item.reason}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!report.style_preferences?.length && (
        <details>
          <summary>Style preferences</summary>
          <ul>
            {report.style_preferences.map((item) => (
              <li key={item.preference}>
                {item.preference}:{' '}
                {item.satisfied ? 'represented' : 'not represented'} ·{' '}
                {item.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p>
        The vanity mirror is an integral feature of its furniture object. Floor
        coverings and supported lamps retain their own scene IDs.
      </p>
      <ul>
        {report.material_requirements.map((item, index) => (
          <li key={index}>
            {item.name}: {item.satisfied ? 'applied to scene' : 'not satisfied'}
            {!item.satisfied && ` · ${item.reason}`}
          </li>
        ))}
      </ul>
      {report.geometry_errors.map((error, index) => (
        <p key={index}>{error}</p>
      ))}
      <p>
        {report.correction_attempts} bounded correction attempts. Furniture is a
        dimensional visual proxy; sample catalogue prices are illustrative.
      </p>
    </details>
  );
}
