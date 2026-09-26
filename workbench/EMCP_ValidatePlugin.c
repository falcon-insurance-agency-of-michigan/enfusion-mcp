// Original companion plugin for enfusion-mcp, licensed under MIT.
// Install in the mod's Scripts/WorkbenchGame directory, never the base game.
[WorkbenchPluginAttribute(name: "MCP Validate Project", description: "Report successful Workbench script startup", wbModules: { "ResourceManager" }, category: "Enfusion MCP")]
class EMCP_ValidatePlugin : WorkbenchPlugin
{
  override void Run()
  {
    WriteResult();
  }

  override void RunCommandline()
  {
    if (WriteResult())
      Workbench.Exit(0);
    else
      Workbench.Exit(1);
  }

  protected bool WriteResult()
  {
    FileHandle output = FileIO.OpenFile("$logs:enfusion-mcp-validation.json", FileMode.WRITE);
    if (!output)
    {
      Print("ENFUSION_MCP_VALIDATION_FAILED: cannot write result", LogLevel.ERROR);
      return false;
    }
    output.WriteLine("{\"schemaVersion\":1,\"plugin\":\"EMCP_ValidatePlugin\",\"loaded\":true}");
    output.Close();
    Print("ENFUSION_MCP_VALIDATION_OK");
    return true;
  }
}
