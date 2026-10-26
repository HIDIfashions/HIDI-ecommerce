"""Read-only live MSG91 diagnosis; never log credentials or raw provider responses."""
import importlib.util, json, pathlib, sys
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('wa_stage',ROOT/'stage.py');stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)
try:
    app=stage.cloud.app('hidi-api');stage.cloud.ready(stage.cloud.snapshot(app))
    result=stage.helper.console.run(app,(ROOT/'provider-check.mjs').read_text())
    result['azureOutboundIps']=app['properties'].get('outboundIpAddresses',[])
    print(json.dumps(result))
except Exception:
    print('Read-only provider inspection failed; sensitive details suppressed',file=sys.stderr);sys.exit(1)
