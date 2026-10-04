using System;
using System.IO;
using Thornhold;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

public static class ThornholdProject
{
    const string ScenePath = "Assets/Thornhold/Scenes/Thornhold.unity";

    [MenuItem("Thornhold/Prepare prototype")]
    public static void Prepare()
    {
        Directory.CreateDirectory("Assets/Thornhold/Scenes"); Directory.CreateDirectory("Assets/Thornhold/Settings"); Directory.CreateDirectory("Assets/Resources");
        AssetDatabase.Refresh();
        var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>("Assets/Thornhold/Settings/Renderer.asset");
        if (renderer == null) { renderer = ScriptableObject.CreateInstance<UniversalRendererData>(); AssetDatabase.CreateAsset(renderer, "Assets/Thornhold/Settings/Renderer.asset"); }
        var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>("Assets/Thornhold/Settings/URP.asset");
        if (pipeline == null) { pipeline = UniversalRenderPipelineAsset.Create(renderer); AssetDatabase.CreateAsset(pipeline, "Assets/Thornhold/Settings/URP.asset"); }
        pipeline.msaaSampleCount = 1; pipeline.renderScale = 1; pipeline.supportsHDR = false;
        pipeline.supportsCameraDepthTexture = false; pipeline.supportsCameraOpaqueTexture = false;
        GraphicsSettings.defaultRenderPipeline = pipeline; QualitySettings.renderPipeline = pipeline;
        var material = AssetDatabase.LoadAssetAtPath<Material>("Assets/Resources/PrototypeLit.mat");
        if (material == null) { material = new Material(Shader.Find("Universal Render Pipeline/Lit")) { enableInstancing = true }; AssetDatabase.CreateAsset(material, "Assets/Resources/PrototypeLit.mat"); }
        PlayerSettings.companyName = "Thornhold"; PlayerSettings.productName = "Thornhold Prototype";
        PlayerSettings.runInBackground = true; PlayerSettings.colorSpace = ColorSpace.Linear;
        PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.StandaloneWindows64, false);
        PlayerSettings.SetGraphicsAPIs(BuildTarget.StandaloneWindows64, new[] { GraphicsDeviceType.Direct3D11 });
        PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
        // Legacy input for this native integration slice; no duplicate input package or game rules.
        var settings = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset")[0]);
        var input = settings.FindProperty("activeInputHandler"); if (input != null) { input.intValue = 0; settings.ApplyModifiedPropertiesWithoutUndo(); }
        if (!File.Exists(ScenePath))
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            new GameObject("Thornhold Client").AddComponent<ThornholdClient>();
            EditorSceneManager.SaveScene(scene, ScenePath);
        }
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        AssetDatabase.SaveAssets(); Debug.Log("THORNHOLD_PREPARED: native client; gameplay remains on Node server.");
    }

    [MenuItem("Thornhold/Build Windows prototype")]
    public static void BuildWindows()
    {
        Prepare(); string output = Path.GetFullPath("Builds/Windows/Thornhold.exe"); Directory.CreateDirectory(Path.GetDirectoryName(output));
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { ScenePath }, locationPathName = output, target = BuildTarget.StandaloneWindows64, options = BuildOptions.Development });
        if (report.summary.result != BuildResult.Succeeded) throw new Exception("Windows build failed: " + report.summary.result);
        Debug.Log("THORNHOLD_BUILD_OK: " + output);
    }
}
