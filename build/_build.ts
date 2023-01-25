import fs from "fs";
import path from "path";
import glob from "fast-glob";
import { compileContract } from "ton-compiler";

async function main() {
  console.log(`=================================================================`);
  console.log(`Build script running, let's find some FunC contracts to compile..`);

  // go over all the root contracts in the contracts directory
  const rootContracts = glob.sync(["contracts/*.fc", "contracts/*.func"]);

  for (const rootContract of rootContracts) {
    const contractName = path.parse(rootContract).name;
    if (contractName == "common") break;
    console.log(`\n* Found contract '${contractName}' - let's compile it:`);

    let result = await compileContract({
      files: [rootContract],
    });

    if (!result.ok) {
      console.error(`\n* Compilation failed!`);
      console.error(result.log);
      return;
    }

    console.log(` - Deleting old build artifact...`);
    glob.sync([`build/${contractName}.cell`, `build/${contractName}.fif`]).map((f) => {
      fs.unlinkSync(f);
    });

    let fiftCellSource = '"Asm.fif" include\n' + result.fift + "\n";
    fs.writeFileSync(`build/${contractName}.fif`, fiftCellSource.replace(/\\n/g, "\n"), "utf8");
    fs.writeFileSync(`build/${contractName}.cell`, result.output as Buffer);
  }

  console.log(``);
}

main();
