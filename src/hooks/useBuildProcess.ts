import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type BuildStatus = "idle" | "queued" | "building" | "completed" | "failed";

interface Build {
  id: string;
  app_name: string;
  app_url: string;
  target_os: string;
  framework: string;
  status: BuildStatus;
  download_url: string | null;
  error_message: string | null;
  created_at: string;
}

interface BuildData {
  appName: string;
  appUrl: string;
  targetOs: "windows" | "macos" | "linux";
  framework: "electron" | "tauri";
  iconBase64?: string;
}

export const useBuildProcess = () => {
  const [status, setStatus] = useState<BuildStatus>("idle");
  const [currentBuild, setCurrentBuild] = useState<Build | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll for build status updates
  useEffect(() => {
    if (!currentBuild || status === "completed" || status === "failed" || status === "idle") {
      return;
    }

    const interval = setInterval(async () => {
      const { data, error } = await supabase
        .from("builds")
        .select("*")
        .eq("id", currentBuild.id)
        .maybeSingle();

      if (error) {
        console.error("Error polling build status:", error);
        return;
      }

      if (data) {
        const typedData = data as Build;
        setCurrentBuild(typedData);
        setStatus(typedData.status as BuildStatus);

        if (typedData.status === "completed") {
          toast.success("Build concluído! Seu instalador está pronto.");
        } else if (typedData.status === "failed") {
          toast.error("Erro no build: " + (typedData.error_message || "Erro desconhecido"));
          setError(typedData.error_message);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentBuild, status]);

  const startBuild = useCallback(async (data: BuildData) => {
    setStatus("queued");
    setError(null);

    try {
      const { data: response, error } = await supabase.functions.invoke("create-build", {
        body: data,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!response.success) {
        throw new Error(response.error || "Erro ao iniciar build");
      }

      // Fetch the created build
      const { data: build, error: fetchError } = await supabase
        .from("builds")
        .select("*")
        .eq("id", response.buildId)
        .maybeSingle();

      if (fetchError || !build) {
        throw new Error("Erro ao buscar dados do build");
      }

      setCurrentBuild(build as Build);
      toast.success("Build iniciado!");
    } catch (err) {
      console.error("Build error:", err);
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      toast.error("Erro ao iniciar build: " + (err instanceof Error ? err.message : "Erro desconhecido"));
    }
  }, []);

  const downloadInstaller = useCallback(async () => {
    if (!currentBuild) {
      toast.error("Dados do build não disponíveis");
      return;
    }

    try {
      toast.loading("Gerando instalador...", { id: "download" });
      
      const response = await supabase.functions.invoke("generate-installer", {
        body: {
          appName: currentBuild.app_name,
          appUrl: currentBuild.app_url,
          targetOs: currentBuild.target_os,
          framework: currentBuild.framework,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Get the blob data
      const blob = new Blob([response.data], { type: "application/octet-stream" });
      
      // Determine file extension
      const extensions: Record<string, string> = {
        windows: ".bat",
        macos: ".command",
        linux: ".sh",
      };
      const ext = extensions[currentBuild.target_os] || ".sh";
      const fileName = `${currentBuild.app_name.replace(/[^a-zA-Z0-9]/g, "_")}_installer${ext}`;

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Instalador baixado com sucesso!", { id: "download" });
    } catch (err) {
      console.error("Download error:", err);
      toast.error(
        "Erro ao baixar instalador: " + (err instanceof Error ? err.message : "Erro desconhecido"),
        { id: "download" }
      );
    }
  }, [currentBuild]);

  const reset = useCallback(() => {
    setStatus("idle");
    setCurrentBuild(null);
    setError(null);
  }, []);

  return {
    status,
    currentBuild,
    error,
    startBuild,
    downloadInstaller,
    reset,
  };
};
