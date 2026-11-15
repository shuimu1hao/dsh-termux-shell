/**
 * Web half of dsh-termux-shell: the `termux_bash` row's configuration form on
 * the Plugins page.
 *
 * The form edits the row's settings namespace through `ctx.configForms`, so
 * values land in the profile's own layer and the Host tool re-reads them on the
 * next call. The bundle has no access to the Host Config schema here, so the
 * fields below mirror `Config` in lib/index.js; keep both lists in step.
 */
window.__ModuleLoader__.load({
  id: 'dsh-termux-shell',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'termux-shell';
    const ROW_KEY = 'dsh-termux-shell#termux-bash';

    /** Fields mirrored from the Host Config; `number` ones reset when cleared. */
    const FIELDS = [
      { key: 'shellPath', kind: 'text', hint: 'hint.shellPath' },
      { key: 'cwd', kind: 'text', hint: 'hint.cwd' },
      { key: 'timeoutMs', kind: 'number', hint: 'hint.number' },
      { key: 'maxTimeoutMs', kind: 'number', hint: 'hint.number' },
      { key: 'maxOutputBytes', kind: 'number', hint: 'hint.number' },
      { key: 'maxSpillBytes', kind: 'number', hint: 'hint.number' },
      { key: 'graceMs', kind: 'number', hint: 'hint.number' }
    ];

    const DICTS = {
      zh: {
        title: 'termux_bash 参数',
        summary: 'shell {shell} · 默认超时 {timeout} ms · 单流上限 {bytes} B',
        'field.acknowledgeUnconfined': '允许无隔离执行',
        'hint.acknowledgeUnconfined': 'Android 没有可用文件沙箱；开启后命令以 harness 进程自身权限运行。',
        'field.shellPath': 'Shell 路径',
        'hint.shellPath': '留空则使用 $PREFIX/bin/bash（存在时），再回退到 PATH 中的 bash。',
        'field.cwd': '默认工作目录',
        'hint.cwd': '未传 workdir 时使用；留空则用会话工作目录。',
        'field.timeoutMs': '默认超时（毫秒）',
        'field.maxTimeoutMs': '超时上限（毫秒）',
        'field.maxOutputBytes': '单流输出上限（字节）',
        'field.maxSpillBytes': 'spill 文件上限（字节）',
        'field.graceMs': '终止宽限期（毫秒）',
        'hint.number': '留空表示恢复默认（清除此项覆盖）。',
        save: '保存',
        saving: '保存中…',
        discard: '还原修改',
        reset: '恢复默认',
        overridden: '已覆盖',
        loading: '正在读取配置…',
        unavailable: '该配置暂未由 Host 提供；确认插件行已启用后刷新页面。',
        readOnly: '当前 profile 不接受配置修改。',
        saveFailed: '保存被拒绝，请检查取值后重试。',
        invalid: '{field} 需要一个大于 0 的数字。'
      },
      en: {
        title: 'termux_bash parameters',
        summary: 'shell {shell} · default timeout {timeout} ms · stream cap {bytes} B',
        'field.acknowledgeUnconfined': 'Allow unconfined execution',
        'hint.acknowledgeUnconfined': 'Android has no usable file sandbox; commands run with the harness process authority.',
        'field.shellPath': 'Shell path',
        'hint.shellPath': 'Empty uses $PREFIX/bin/bash when present, then bash from PATH.',
        'field.cwd': 'Default working directory',
        'hint.cwd': 'Used when a call passes no workdir; empty uses the session workspace.',
        'field.timeoutMs': 'Default timeout (ms)',
        'field.maxTimeoutMs': 'Timeout ceiling (ms)',
        'field.maxOutputBytes': 'Per-stream output cap (bytes)',
        'field.maxSpillBytes': 'Spill file cap (bytes)',
        'field.graceMs': 'Termination grace (ms)',
        'hint.number': 'Empty clears the override and restores the default.',
        save: 'Save',
        saving: 'Saving…',
        discard: 'Discard',
        reset: 'Restore defaults',
        overridden: 'Override',
        loading: 'Reading configuration…',
        unavailable: 'This configuration is not served by the Host yet; enable the row and refresh.',
        readOnly: 'This profile does not accept configuration edits.',
        saveFailed: 'The Host refused the save; check the values and retry.',
        invalid: '{field} needs a number greater than 0.'
      }
    };

    const mutedStyle = { color: 'var(--dsw-alias-text-tertiary, rgba(127,127,127,0.95))', fontSize: 12, margin: '4px 0 0' };
    const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
    const labelStyle = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 };
    const inputStyle = {
      width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 6,
      border: '1px solid rgba(127,127,127,0.35)', background: 'transparent', color: 'inherit', font: 'inherit'
    };
    const badgeStyle = { fontSize: 11, padding: '0 6px', borderRadius: 999, border: '1px solid rgba(127,127,127,0.45)' };
    const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 };
    const buttonStyle = {
      padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(127,127,127,0.45)',
      background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer'
    };
    const primaryStyle = { padding: '5px 12px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 600, cursor: 'pointer' };
    const checkRowStyle = { display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 };

    function formatValue(value) {
      return value === undefined || value === null ? '' : String(value);
    }

    /** The namespace the Host serves for this row: known ids first, then shape. */
    function pickNamespace(views) {
      const names = views.map((view) => view.ns);
      for (const candidate of ['termux-bash', 'include:termux-bash', ROW_KEY]) {
        if (names.includes(candidate)) return candidate;
      }
      const byName = views.find((view) => /termux-bash/.test(view.ns));
      if (byName !== undefined) return byName.ns;
      const bySchema = views.find((view) => {
        const schema = JSON.stringify(view.schema ?? '');
        return schema.includes('acknowledgeUnconfined') && schema.includes('maxSpillBytes');
      });
      return bySchema?.ns;
    }

    /** Lazily bind the row's settings form once the Host serves its namespace. */
    function createController(ctx) {
      const mirror = ctx.configForms.describe();
      let form;
      return {
        resolve() {
          if (form !== undefined) return form;
          const views = mirror.getSnapshot().view?.namespaces ?? [];
          const namespace = pickNamespace(views);
          if (namespace === undefined) return undefined;
          form = ctx.configForms.get(namespace);
          return form;
        },
        subscribe(listener) { return mirror.subscribe(listener); },
        ensure() { mirror.ensure?.(); }
      };
    }

    function useResolvedForm(controller) {
      const [form, setForm] = React.useState(() => controller.resolve());
      React.useEffect(() => {
        controller.ensure();
        if (form !== undefined) return undefined;
        return controller.subscribe(() => {
          const next = controller.resolve();
          if (next !== undefined) setForm(next);
        });
      }, [controller, form]);
      return form;
    }

    function useFormSnapshot(form) {
      const [snapshot, setSnapshot] = React.useState(() => (form === undefined ? undefined : form.getSnapshot()));
      React.useEffect(() => {
        if (form === undefined) {
          setSnapshot(undefined);
          return undefined;
        }
        setSnapshot(form.getSnapshot());
        return form.subscribe(() => setSnapshot(form.getSnapshot()));
      }, [form]);
      return snapshot;
    }

    function parseNumber(raw) {
      const text = raw.trim();
      if (text === '') return { kind: 'unset' };
      const value = Number(text);
      if (!Number.isFinite(value) || value <= 0) return null;
      return { kind: 'set', value };
    }

    function parseText(raw) {
      const text = raw.trim();
      return text === '' ? { kind: 'unset' } : { kind: 'set', value: text };
    }

    function TermuxBashSettings(props) {
      const t = props.t;
      const form = useResolvedForm(props.controller);
      const snapshot = useFormSnapshot(form);
      const [drafts, setDrafts] = React.useState({});
      const [saving, setSaving] = React.useState(false);
      const [error, setError] = React.useState(null);

      const accepted = snapshot?.value ?? {};
      const acceptedKey = JSON.stringify(accepted);
      React.useEffect(() => {
        setDrafts({});
        setError(null);
      }, [acceptedKey]);

      if (props.view === 'summary') {
        return t('summary', {
          shell: formatValue(accepted.shellPath) || 'bash',
          timeout: formatValue(accepted.timeoutMs) || '120000',
          bytes: formatValue(accepted.maxOutputBytes) || '64000'
        });
      }
      if (snapshot === undefined || snapshot.status === 'loading') return h('p', { style: mutedStyle }, t('loading'));
      if (snapshot.status === 'unavailable') return h('p', { style: mutedStyle }, t('unavailable'));

      const writable = snapshot.writable === true;
      const disabled = !writable || saving;
      const userLayer = snapshot.user !== null && typeof snapshot.user === 'object' ? snapshot.user : {};
      const overridden = (key) => Object.prototype.hasOwnProperty.call(userLayer, key);
      const draftOf = (key) => (Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : formatValue(accepted[key]));

      const fields = FIELDS.map((field) => h('div', { key: field.key, style: fieldStyle },
        h('label', { style: labelStyle, htmlFor: `termux-${field.key}` },
          h('span', null, t(`field.${field.key}`)),
          overridden(field.key) ? h('span', { style: badgeStyle }, t('overridden')) : null),
        h('input', {
          id: `termux-${field.key}`,
          type: field.kind === 'number' ? 'number' : 'text',
          min: field.kind === 'number' ? '1' : undefined,
          step: field.kind === 'number' ? '1' : undefined,
          inputMode: field.kind === 'number' ? 'numeric' : undefined,
          value: draftOf(field.key),
          placeholder: t(`hint.${field.key}`),
          disabled,
          style: inputStyle,
          onChange: (event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))
        }),
        h('p', { style: mutedStyle }, t(field.hint))));

      const acknowledge = h('label', { key: 'acknowledgeUnconfined', style: checkRowStyle },
        h('input', {
          type: 'checkbox',
          checked: Object.prototype.hasOwnProperty.call(drafts, 'acknowledgeUnconfined')
            ? drafts.acknowledgeUnconfined === true
            : accepted.acknowledgeUnconfined === true,
          disabled,
          onChange: (event) => setDrafts((current) => ({ ...current, acknowledgeUnconfined: event.target.checked }))
        }),
        h('span', null,
          h('span', { style: labelStyle }, t('field.acknowledgeUnconfined'), overridden('acknowledgeUnconfined') ? h('span', { style: badgeStyle }, t('overridden')) : null),
          h('span', { style: { ...mutedStyle, display: 'block' } }, t('hint.acknowledgeUnconfined'))));

      const submit = async () => {
        setError(null);
        const ops = [];
        for (const field of FIELDS) {
          if (!Object.prototype.hasOwnProperty.call(drafts, field.key)) continue;
          const parsed = field.kind === 'number' ? parseNumber(drafts[field.key]) : parseText(drafts[field.key]);
          if (parsed === null) {
            setError(t('invalid', { field: t(`field.${field.key}`) }));
            return;
          }
          if (parsed.kind === 'unset') {
            if (overridden(field.key)) ops.push({ op: 'unset', path: [field.key] });
            continue;
          }
          if (parsed.value === accepted[field.key]) continue;
          ops.push({ op: 'set', path: [field.key], value: parsed.value });
        }
        if (Object.prototype.hasOwnProperty.call(drafts, 'acknowledgeUnconfined')) {
          const next = drafts.acknowledgeUnconfined === true;
          if (next !== (accepted.acknowledgeUnconfined === true)) ops.push({ op: 'set', path: ['acknowledgeUnconfined'], value: next });
        }
        if (ops.length === 0) {
          setDrafts({});
          return;
        }
        setSaving(true);
        try {
          const ok = await form.mutate(ops, snapshot.revision);
          if (ok) setDrafts({});
          else setError(t('saveFailed'));
        } catch (failure) {
          setError(String(failure?.message ?? failure));
        } finally {
          setSaving(false);
        }
      };

      const reset = async () => {
        setError(null);
        const ops = [];
        for (const field of FIELDS) if (overridden(field.key)) ops.push({ op: 'unset', path: [field.key] });
        if (overridden('acknowledgeUnconfined')) ops.push({ op: 'unset', path: ['acknowledgeUnconfined'] });
        if (ops.length === 0) return;
        setSaving(true);
        try {
          const ok = await form.mutate(ops, snapshot.revision);
          if (ok) setDrafts({});
          else setError(t('saveFailed'));
        } catch (failure) {
          setError(String(failure?.message ?? failure));
        } finally {
          setSaving(false);
        }
      };

      return h('section', null,
        h('h4', { style: { margin: '0 0 12px', fontSize: 14, fontWeight: 600 } }, t('title')),
        acknowledge,
        fields,
        error === null ? null : h('p', { role: 'alert', style: { color: 'var(--dsw-alias-text-danger, #d1242f)', fontSize: 12, margin: '8px 0' } }, error),
        h('div', { style: rowStyle },
          h('button', { type: 'button', style: primaryStyle, disabled: disabled || Object.keys(drafts).length === 0, onClick: submit }, saving ? t('saving') : t('save')),
          h('button', { type: 'button', style: buttonStyle, disabled, onClick: () => { setDrafts({}); setError(null); } }, t('discard')),
          h('button', { type: 'button', style: buttonStyle, disabled, onClick: reset }, t('reset')),
          writable ? null : h('span', { style: mutedStyle }, t('readOnly'))));
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'termux-shell: dictionaries');
        const controller = createController(ctx);
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key: ROW_KEY,
          locale: NS,
          inject: () => ({ controller })
        }, TermuxBashSettings));
      }
    };
  }
});
