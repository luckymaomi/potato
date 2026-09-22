import {
  AudioOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  workspaceApi,
  type TtsOptions,
  type TtsProvider,
} from "../api/workspace";
import { notifyAppError, notifyAppSuccess } from "../errors/appError";

interface TtsFormValues {
  provider: string;
  base_url: string;
  api_key: string;
  role?: string;
  style?: string;
}

export function TtsConfigPage() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<TtsFormValues>();
  const [options, setOptions] = useState<TtsOptions>({ roles: [], styles: [] });
  const [providers, setProviders] = useState<TtsProvider[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadOptions = useCallback(
    async (
      values: Pick<TtsFormValues, "provider" | "base_url" | "api_key">,
      fallback?: TtsConfigFallback,
    ) => {
      setOptions({ roles: [], styles: [] });
      try {
        const scanned = await workspaceApi.ttsOptions(values);
        setOptions({
          roles: optionsWithFallback(scanned.roles, fallback?.role),
          styles: optionsWithFallback(scanned.styles, fallback?.style),
        });
      } catch {
        setOptions({
          roles: optionsWithFallback([], fallback?.role),
          styles: optionsWithFallback([], fallback?.style),
        });
      }
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [config, providerItems] = await Promise.all([
        workspaceApi.ttsConfig(),
        workspaceApi.ttsProviders(),
      ]);
      setProviders(providerItems);
      form.setFieldsValue({
        provider: config.provider,
        base_url: config.base_url,
        role: config.role ?? undefined,
        style: config.style ?? undefined,
        api_key: "",
      });
      setConfigured(config.configured);
      await loadOptions(
        {
          provider: config.provider,
          base_url: config.base_url,
          api_key: "",
        },
        config,
      );
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    } finally {
      setLoading(false);
    }
  }, [form, loadOptions, message, modal]);

  useEffect(() => {
    void load();
  }, [load]);
  const save = async (values: TtsFormValues) => {
    setSaving(true);
    try {
      const saved = await workspaceApi.saveTtsConfig(values);
      setConfigured(saved.configured);
      notifyAppSuccess(
        message,
        "TTS 全局配置已保存；密钥只写入服务端，不会返回页面",
      );
      await loadOptions(values, saved);
      form.setFieldValue("api_key", "");
    } catch (reason) {
      notifyAppError({ message, modal }, reason);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page tts-config-page">
      <header className="page-heading">
        <div>
          <h1>配音配置</h1>
          <Typography.Text type="secondary">
            独立于图片模型的全局 TTS 适配器配置
          </Typography.Text>
        </div>
        <Space>
          <Tag
            color={configured ? "success" : "warning"}
            icon={configured ? <CheckCircleOutlined /> : <AudioOutlined />}
          >
            {configured ? "已配置" : "未配置"}
          </Tag>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => void load()}
          >
            重新读取
          </Button>
        </Space>
      </header>
      <Card className="settings-surface" loading={loading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void save(values)}
          initialValues={{ provider: "freedub" }}
        >
          <div className="tts-config-grid">
            <Form.Item
              name="provider"
              label="TTS 适配器"
              rules={[{ required: true, message: "请选择适配器" }]}
            >
              <Select
                options={providers.map((provider) => ({
                  value: provider.id,
                  label: provider.label,
                }))}
                onChange={() => {
                  form.setFieldsValue({ role: undefined, style: undefined });
                  setOptions({ roles: [], styles: [] });
                }}
              />
            </Form.Item>
            <Form.Item
              name="base_url"
              label="服务地址"
              rules={[{ required: true, message: "请输入服务地址" }]}
            >
              <Input placeholder="https://api.example.com" />
            </Form.Item>
            <Form.Item
              name="api_key"
              label="API 密钥"
              extra="Freedub 无需密钥；如服务要求鉴权可选填，已保存密钥不会回显"
            >
              <Input.Password
                placeholder={
                  configured ? "已配置，重新输入以更新" : "可选"
                }
              />
            </Form.Item>
            <Form.Item name="role" label="默认角色">
              <Select
                allowClear
                options={options.roles.map((role) => ({
                  value: role,
                  label: role,
                }))}
                placeholder={options.roles.length ? "请选择角色" : "先选择适配器并读取目录"}
              />
            </Form.Item>
            <Form.Item name="style" label="默认风格">
              <Select
                allowClear
                options={options.styles.map((style) => ({
                  value: style,
                  label: style,
                }))}
                placeholder={options.styles.length ? "请选择风格" : "先选择适配器并读取目录"}
              />
            </Form.Item>
          </div>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
          >
            保存 TTS 配置
          </Button>
        </Form>
      </Card>
    </div>
  );
}

interface TtsConfigFallback {
  role?: string | null;
  style?: string | null;
}

function optionsWithFallback(
  values: string[],
  fallback: string | null | undefined,
): string[] {
  if (!fallback || values.includes(fallback)) return values;
  return [fallback, ...values];
}
